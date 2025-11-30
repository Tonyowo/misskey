#!/bin/bash

# ===============================
# Misskey 数据库配置（按你当前系统填写）
# ===============================
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="misskey"
DB_USER="misskey"
DB_PASS="MissKey31415926"

# ===============================
# 参数检查
# ===============================
if [ -z "$1" ]; then
    echo "用法: $0 <邮箱地址>"
    exit 1
fi

EMAIL="$1"

# ===============================
# 运行 SQL 查询
# ===============================
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -F "|" <<EOF
SELECT 
  u.id,
  u.username,
  u.name,
  p.email
FROM "user" AS u
JOIN user_profile AS p
  ON u.id = p."userId"
WHERE p.email = '$EMAIL';
EOF

