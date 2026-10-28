import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDuplicateEmailError } from './hubspotErrors.mjs';

const DUPLICATE_MESSAGE =
  'Cannot set PropertyValueCoordinates{portalId=245752383, objectTypeId=ObjectTypeId{legacyObjectType=CONTACT}, propertyName=email, value=bosung97@hyundai.com} on 579512868573. 575276686050 already has that value.';

test('이메일 중복 오류를 안내 문구로 바꾼다', () => {
  const text = describeDuplicateEmailError(DUPLICATE_MESSAGE);
  assert.ok(text.includes('bosung97@hyundai.com'));
  assert.ok(text.includes('ID 575276686050'));
  assert.ok(text.includes('ID 579512868573'));
  assert.ok(text.includes('병합'));
});

test('다른 오류는 null 을 돌려준다', () => {
  assert.equal(describeDuplicateEmailError('Property values were not valid'), null);
  assert.equal(describeDuplicateEmailError(undefined), null);
});

test('이메일이 아닌 속성의 중복은 처리하지 않는다', () => {
  const msg = DUPLICATE_MESSAGE.replace('propertyName=email', 'propertyName=phone');
  assert.equal(describeDuplicateEmailError(msg), null);
});
