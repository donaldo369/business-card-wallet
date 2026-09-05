#!/usr/bin/env node
/**
 * card-images 버킷의 모든 파일을 옛 Supabase 프로젝트 → 새 프로젝트로 복사합니다.
 * 일회성 이전용 스크립트입니다. 원본은 건드리지 않고 읽기만 합니다.
 *
 * 사용법:
 *   OLD_SUPABASE_URL=https://xxxx.supabase.co \
 *   OLD_SERVICE_ROLE_KEY=... \
 *   NEW_SUPABASE_URL=https://yyyy.supabase.co \
 *   NEW_SERVICE_ROLE_KEY=... \
 *   node scripts/migrate-storage.mjs
 *
 * 옵션 환경변수:
 *   BUCKET=card-images   대상 버킷 이름
 *   CONCURRENCY=8        동시 복사 개수
 *   DRY_RUN=1            목록만 세어 보고 실제 복사는 하지 않음
 */
import { createClient } from '@supabase/supabase-js';

const required = ['OLD_SUPABASE_URL', 'OLD_SERVICE_ROLE_KEY', 'NEW_SUPABASE_URL', 'NEW_SERVICE_ROLE_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`환경변수가 없습니다: ${missing.join(', ')}`);
  process.exit(1);
}

const BUCKET = process.env.BUCKET || 'card-images';
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const DRY_RUN = process.env.DRY_RUN === '1';
const PAGE = 1000;

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const oldSb = createClient(process.env.OLD_SUPABASE_URL, process.env.OLD_SERVICE_ROLE_KEY, clientOpts);
const newSb = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SERVICE_ROLE_KEY, clientOpts);

/** 버킷을 재귀적으로 훑어 파일 경로를 모두 모은다. id가 null인 항목은 폴더. */
async function listAll(prefix = '') {
  const paths = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await oldSb.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`목록 조회 실패 (${prefix || '/'}): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) paths.push(...(await listAll(full)));
      else paths.push(full);
    }
    if (data.length < PAGE) break;
  }
  return paths;
}

async function copyOne(path) {
  const { data: blob, error: dlError } = await oldSb.storage.from(BUCKET).download(path);
  if (dlError) throw new Error(`다운로드 실패: ${dlError.message}`);

  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: upError } = await newSb.storage.from(BUCKET).upload(path, buffer, {
    contentType: blob.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: true,
  });
  if (upError) throw new Error(`업로드 실패: ${upError.message}`);
  return buffer.length;
}

// 새 프로젝트에 버킷이 준비돼 있는지 먼저 확인 (supabase_setup.sql을 실행했다면 있음)
const { error: bucketError } = await newSb.storage.getBucket(BUCKET);
if (bucketError) {
  console.error(`새 프로젝트에 '${BUCKET}' 버킷이 없습니다: ${bucketError.message}`);
  console.error('먼저 새 프로젝트 SQL Editor에서 supabase_setup.sql을 실행하세요.');
  process.exit(1);
}

console.log(`[1/2] '${BUCKET}' 버킷 파일 목록을 읽는 중...`);
const paths = await listAll();
console.log(`      파일 ${paths.length}개 발견`);

if (DRY_RUN) {
  console.log('DRY_RUN=1 이므로 복사하지 않고 종료합니다.');
  console.log(paths.slice(0, 10).map((p) => `      ${p}`).join('\n'));
  if (paths.length > 10) console.log(`      ... 외 ${paths.length - 10}개`);
  process.exit(0);
}

console.log(`[2/2] 새 프로젝트로 복사 중 (동시 ${CONCURRENCY}개)...`);
let done = 0;
let bytes = 0;
const failures = [];
let cursor = 0;

async function worker() {
  while (cursor < paths.length) {
    const path = paths[cursor++];
    try {
      bytes += await copyOne(path);
    } catch (err) {
      failures.push({ path, message: err.message });
    }
    done++;
    if (done % 25 === 0 || done === paths.length) {
      process.stdout.write(`\r      ${done}/${paths.length} 완료, 실패 ${failures.length}건`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
process.stdout.write('\n');

console.log(`\n복사 완료: ${paths.length - failures.length}/${paths.length}개, ${(bytes / 1024 / 1024).toFixed(1)}MB`);
if (failures.length) {
  console.error(`\n실패 ${failures.length}건:`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f.path} — ${f.message}`);
  if (failures.length > 20) console.error(`  ... 외 ${failures.length - 20}건`);
  console.error('\n실패한 파일은 스크립트를 다시 실행하면 재시도됩니다(upsert).');
  process.exit(1);
}
