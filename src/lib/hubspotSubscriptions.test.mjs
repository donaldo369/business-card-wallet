import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_SUBSCRIPTION_NAMES,
  LEGAL_BASIS,
  LEGAL_BASIS_EXPLANATION,
  matchSubscriptions,
  buildStatusBody,
} from './hubspotSubscriptions.mjs';

const defs = [
  { id: '111', name: '뉴스레터 구독 동의' },
  { id: '222', name: '마케팅 정보 활용 동의' },
  { id: '333', name: 'One to One' },
  { id: '444', name: '기타 구독' },
];

test('세 가지 대상 구독을 정확히 찾는다', () => {
  const { matched, missing } = matchSubscriptions(defs, TARGET_SUBSCRIPTION_NAMES);
  assert.deepEqual(matched.map(m => m.id), ['111', '222', '333']);
  assert.deepEqual(missing, []);
});

test('대상이 아닌 구독은 포함하지 않는다', () => {
  const { matched } = matchSubscriptions(defs, TARGET_SUBSCRIPTION_NAMES);
  assert.ok(!matched.some(m => m.id === '444'));
});

test('앞뒤 공백과 연속 공백을 무시하고 매칭한다', () => {
  const messy = [{ id: '1', name: '  뉴스레터   구독 동의 ' }];
  const { matched, missing } = matchSubscriptions(messy, ['뉴스레터 구독 동의']);
  assert.deepEqual(matched.map(m => m.id), ['1']);
  assert.deepEqual(missing, []);
});

test('영문 구독명은 대소문자를 무시하고 매칭한다', () => {
  const variants = [{ id: '9', name: 'ONE TO ONE' }];
  const { matched } = matchSubscriptions(variants, ['One to One']);
  assert.deepEqual(matched.map(m => m.id), ['9']);
});

test('찾지 못한 구독명은 missing 으로 보고한다', () => {
  const partial = [{ id: '111', name: '뉴스레터 구독 동의' }];
  const { matched, missing } = matchSubscriptions(partial, TARGET_SUBSCRIPTION_NAMES);
  assert.deepEqual(matched.map(m => m.id), ['111']);
  assert.deepEqual(missing, ['마케팅 정보 활용 동의', 'One to One']);
});

test('EMAIL 이 아닌 채널의 동명 구독은 제외한다', () => {
  const mixed = [
    { id: 'sms', name: 'One to One', channel: 'SMS' },
    { id: 'email', name: 'One to One', channel: 'EMAIL' },
  ];
  const { matched } = matchSubscriptions(mixed, ['One to One']);
  assert.deepEqual(matched.map(m => m.id), ['email']);
});

test('같은 이름이 여러 개면 첫 번째만 쓴다', () => {
  const dupes = [
    { id: 'a', name: '뉴스레터 구독 동의' },
    { id: 'b', name: '뉴스레터 구독 동의' },
  ];
  const { matched } = matchSubscriptions(dupes, ['뉴스레터 구독 동의']);
  assert.deepEqual(matched.map(m => m.id), ['a']);
});

test('정의 목록이 비어 있으면 전부 missing', () => {
  const { matched, missing } = matchSubscriptions([], TARGET_SUBSCRIPTION_NAMES);
  assert.deepEqual(matched, []);
  assert.deepEqual(missing, TARGET_SUBSCRIPTION_NAMES);
});

test('구독 요청 본문을 스펙대로 만든다', () => {
  // 이메일은 URL 경로(subscriberIdString)로 들어가므로 본문에는 없다
  assert.deepEqual(buildStatusBody('111'), {
    subscriptionId: '111',
    statusState: 'SUBSCRIBED',
    legalBasis: LEGAL_BASIS,
    legalBasisExplanation: LEGAL_BASIS_EXPLANATION,
    channel: 'EMAIL',
  });
});

test('법적 근거와 설명은 요구된 값으로 고정되어 있다', () => {
  assert.equal(LEGAL_BASIS, 'CONSENT_WITH_NOTICE');
  assert.equal(LEGAL_BASIS_EXPLANATION, '명함을 직접 전달 받음');
});

test('대상 구독명은 요청된 세 가지다', () => {
  assert.deepEqual(TARGET_SUBSCRIPTION_NAMES, [
    '뉴스레터 구독 동의',
    '마케팅 정보 활용 동의',
    'One to One',
  ]);
});
