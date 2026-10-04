/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

// Scan the retained stream atomically. The seen set is intersected with retained IDs,
// so it cannot grow past the bounded notification timeline or accept another user's IDs.
const readScript = `
local rows = redis.call('XRANGE', KEYS[1], '-', '+')
local watermark = redis.call('GET', KEYS[3])
local requested = {}
for _, id in ipairs(cjson.decode(ARGV[2])) do requested[id] = true end
local retained = {}
local states = {}
local unread = 0
local marked = {}
local function atOrBefore(id, limit)
  if not limit then return false end
  local am, as = string.match(id, '^(%d+)%-(%d+)$')
  local bm, bs = string.match(limit, '^(%d+)%-(%d+)$')
  if tonumber(am) ~= tonumber(bm) then return tonumber(am) < tonumber(bm) end
  if #as ~= #bs then return #as < #bs end
  return as <= bs
end
if ARGV[1] == 'all' and #rows > 0 then
  local newest = rows[#rows][1]
  if not atOrBefore(newest, watermark) then
    redis.call('SET', KEYS[3], newest)
    watermark = newest
  end
end
for _, row in ipairs(rows) do
  local data
  for i = 1, #row[2], 2 do
    if row[2][i] == 'data' then data = cjson.decode(row[2][i + 1]) end
  end
  if data then
    retained[data.id] = true
    if ARGV[1] == 'some' and requested[data.id] then
      redis.call('SADD', KEYS[2], data.id)
      table.insert(marked, data.id)
    end
    local seen = atOrBefore(row[1], watermark) or redis.call('SISMEMBER', KEYS[2], data.id) == 1
    states[data.id] = seen
    if not seen then unread = unread + 1 end
  end
end
for _, id in ipairs(redis.call('SMEMBERS', KEYS[2])) do
  if not retained[id] then redis.call('SREM', KEYS[2], id) end
end
if ARGV[1] == 'all' then redis.call('DEL', KEYS[2]) end
return cjson.encode({ states = states, unreadCount = unread, marked = marked })
`;

type ReadState = { states: Record<string, boolean>; unreadCount: number; marked: string[] | Record<string, never> };

@Injectable()
export class NotificationReadService {
	constructor(@Inject(DI.redis) private redisClient: Redis.Redis) {}

	@bindThis
	public async getState(userId: string, mode: 'state' | 'some' | 'all' = 'state', notificationIds: string[] = []): Promise<ReadState> {
		const result = await this.redisClient.eval(readScript, 3,
			`notificationTimeline:${userId}`, `seenNotifications:${userId}`, `latestReadNotification:${userId}`,
			mode, JSON.stringify(notificationIds));
		return JSON.parse(result as string) as ReadState;
	}
}
