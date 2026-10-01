const test = require('node:test');
const assert = require('node:assert/strict');
const { selectRoundRobinAccount } = require('../src/utils/round-robin');

function assign(recipientCount, accountCount) {
  const accounts = Array.from({ length: accountCount }, (_, index) => `account-${index + 1}`);
  return Array.from({ length: recipientCount }, (_, sequence) =>
    selectRoundRobinAccount(sequence, accounts));
}

test('assigns every recipient to the only connected account', () => {
  assert.deepEqual(assign(5, 1), Array(5).fill('account-1'));
});

test('alternates evenly across two connected accounts', () => {
  assert.deepEqual(assign(6, 2), [
    'account-1', 'account-2', 'account-1', 'account-2', 'account-1', 'account-2',
  ]);
});

test('cycles through three connected accounts', () => {
  assert.deepEqual(assign(6, 3), [
    'account-1', 'account-2', 'account-3', 'account-1', 'account-2', 'account-3',
  ]);
});

test('distributes a non-divisible recipient count without changing order', () => {
  const assignments = assign(8, 3);
  assert.deepEqual(assignments, [
    'account-1', 'account-2', 'account-3', 'account-1',
    'account-2', 'account-3', 'account-1', 'account-2',
  ]);
  assert.deepEqual(
    ['account-1', 'account-2', 'account-3'].map((account) => assignments.filter((item) => item === account).length),
    [3, 3, 2],
  );
});

test('rejects an empty account set', () => {
  assert.throws(() => selectRoundRobinAccount(0, []), /At least one sending account/);
});