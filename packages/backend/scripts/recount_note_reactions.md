# 重算历史帖子的表情统计

正常更新代码、重新构建并完整重启后端后，主进程会在启动 HTTP 服务和队列 worker 之前自动修复本地历史帖子的表情计数。首次更新时应先停止所有旧的服务进程和 worker，再启动新版本；不要让旧版 worker 在修复期间继续消费任务。无需另行运行下面的手动重算命令，也不需要新增数据库 migration。

自动修复分批读取真实反应记录，重建计数和用户缓存。尚未写回的反应也已经存在于反应记录中，因此会一起纳入重算，并在事务提交前清除对应本地帖子的 Redis 缓冲，避免后续重复累加。修复不修改远程帖子的统计或缓冲，也不修改反应记录。多个新主进程同时启动时通过 PostgreSQL advisory lock 串行等待修复。

完成标记保存在 reactions Redis 中且无过期时间，普通重启会跳过历史扫描。请保留 Redis 的持久化数据；如果 Redis 被清空，下一次完整重启会重新核对，已经正确的统计不会重复累加。启动日志会显示 `Historical reaction counts repaired` 及核对、修复数量。修复失败时不会标记完成，主进程不会继续启动服务，下次启动会从真实反应记录重试；即使此前已清除部分缓冲，也能恢复正确计数。

以下工具用于需要额外诊断、指定帖子重算及重建用户缓存时手动维护：

`recount_note_reactions.mjs` 根据 `note_reaction` 中真实的反应记录重建指定本地帖子的统计和最近 16 位反应用户缓存，默认仅核对差异。使用实例当前编译配置中的 PostgreSQL 和 reactions Redis，不扫描其他帖子，也不修改反应记录。远程帖子的反应记录可能不完整，工具会拒绝重算。

先部署包含 `ReactionsBufferingService.bake()` 修复的版本并完成后端构建。在部署目录编译当前配置，然后核对这条帖子：

```sh
pnpm --filter backend compile-config
cd packages/backend
node scripts/recount_note_reactions.mjs --note-id arnb2iuyfnaq03qm
```

核对报告包含 `before`（存储的统计）、`after`（实际反应记录统计）和 `pendingBuffers`。以执行时的真实记录为准，不把截图中的数字写死。

实际修复需要维护窗口：

1. 如果有待写入缓冲，保持修复后的 worker 运行，等待缓冲写回。再次核对确认 `pendingBuffers` 为 `0`。
2. 停止所有 Misskey 服务进程和队列 worker，保留 PostgreSQL、Redis 运行。仅打开维护页面不能防止后台联邦任务继续写入。即使禁用了表情缓冲，也必须停止进程，因为反应记录与计数分两步写入。
3. 在同一部署目录、使用同一配置执行：

   ```sh
   node scripts/recount_note_reactions.mjs --note-id arnb2iuyfnaq03qm --apply --maintenance --backup /tmp/wowcool-reactions-before.json
   ```

4. 再执行默认核对命令，确认 `before` 与 `after` 一致，然后恢复服务和 worker，刷新帖子验证。

多条帖子可以重复传入 `--note-id`。工具先检查所有目标是否存在，整个数据库修复在一个事务中完成。任何目标仍有反应缓冲或发生错误都会中止；不会清除 Redis 缓冲。运行前应确保没有另一个重算工具同时运行。

写入前会生成权限为 `0600` 的原始统计和用户缓存备份；指定路径已存在时中止，不覆盖旧备份。不指定 `--backup` 时使用系统临时目录中的唯一文件，并在成功报告中返回路径。备份含用户 ID，应保存在服务器私有目录，不提交到仓库。应用后立刻重复执行不会重复累加。

如需回退，保持所有 Misskey 服务与 worker 停止，根据备份中的 `id`、`reactions`、`reactionAndUserPairCache` 恢复对应 `note` 行；恢复服务后的新反应不应再被旧备份覆盖。
