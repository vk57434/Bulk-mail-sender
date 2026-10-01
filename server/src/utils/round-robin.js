function selectRoundRobinAccount(sequence, accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('At least one sending account is required');
  }
  const index = Number.isInteger(sequence) && sequence >= 0 ? sequence : 0;
  return accounts[index % accounts.length];
}

module.exports = { selectRoundRobinAccount };