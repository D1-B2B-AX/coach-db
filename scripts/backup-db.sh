#!/bin/bash
# DB 백업 스크립트
# 사용법: ./scripts/backup-db.sh [local|production]
#
# local:      로컬 개발 DB 백업 (기본값)
# production: 프로덕션 DB 백업 (DATABASE_URL 환경변수 필요)

set -e

ENV="${1:-local}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

if [ "$ENV" = "local" ]; then
  DB_URL="postgresql://ga:dev@localhost:5433/coach_db_dev"
  FILENAME="backup_local_${TIMESTAMP}.sql"
elif [ "$ENV" = "production" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL 환경변수가 필요합니다."
    echo "사용법: DATABASE_URL=postgresql://... ./scripts/backup-db.sh production"
    exit 1
  fi
  DB_URL="$DATABASE_URL"
  FILENAME="backup_prod_${TIMESTAMP}.sql"
else
  echo "ERROR: 알 수 없는 환경: $ENV (local 또는 production)"
  exit 1
fi

echo "백업 시작: $ENV → $BACKUP_DIR/$FILENAME"
pg_dump "$DB_URL" --no-owner --no-acl > "$BACKUP_DIR/$FILENAME"

# gzip 압축
gzip "$BACKUP_DIR/$FILENAME"
FINAL="$BACKUP_DIR/${FILENAME}.gz"

SIZE=$(du -h "$FINAL" | cut -f1)
echo "백업 완료: $FINAL ($SIZE)"

# 30일 이상 된 백업 삭제
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -delete 2>/dev/null
echo "30일 이상 된 백업 파일 정리 완료"
