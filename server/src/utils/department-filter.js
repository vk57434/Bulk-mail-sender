function cleanDepartment(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function departmentKey(value) {
  return cleanDepartment(value).toLocaleLowerCase('en-US');
}

function inspectDepartments(rows) {
  const groups = new Map();
  let unassignedCount = 0;
  const unassignedSamples = [];

  for (const row of rows) {
    const name = cleanDepartment(row.department);
    if (!name) {
      unassignedCount += 1;
      if (unassignedSamples.length < 5) unassignedSamples.push({ name: String(row.name || '').trim(), email: String(row.email || '').trim() });
      continue;
    }
    const key = departmentKey(name);
    const group = groups.get(key) || { key, name, count: 0, samples: [] };
    group.count += 1;
    if (group.samples.length < 5) group.samples.push({ name: String(row.name || '').trim(), email: String(row.email || '').trim() });
    groups.set(key, group);
  }

  return {
    departments: [...groups.values()],
    unassignedCount,
    unassignedSamples,
  };
}

function filterRowsByDepartments(rows, selectedDepartments) {
  const { departments, unassignedCount, unassignedSamples } = inspectDepartments(rows);
  if (departments.length === 0) {
    return {
      hasDepartments: false,
      departments,
      selectedDepartments: [],
      selectedRows: rows,
      excludedCount: 0,
      unassignedCount,
      unassignedSamples,
    };
  }

  if (!Array.isArray(selectedDepartments) || selectedDepartments.length === 0) {
    return {
      hasDepartments: true,
      departments,
      selectedDepartments: [],
      selectedRows: rows,
      excludedCount: 0,
      unassignedCount,
      unassignedSamples,
    };
  }

  const available = new Map(departments.map((department) => [department.key, department]));
  const selectedKeys = new Set(selectedDepartments.map(departmentKey));
  const invalid = [...selectedKeys].filter((key) => key !== '' ? !available.has(key) : unassignedCount === 0);
  if (invalid.length) {
    throw Object.assign(new Error('One or more selected departments are not present in the uploaded CSV.'), {
      code: 'INVALID_DEPARTMENT_SELECTION',
      invalidDepartments: invalid,
      departments,
    });
  }

  const selectedRows = rows.filter((row) => {
    const key = departmentKey(row.department);
    return key ? selectedKeys.has(key) : selectedKeys.has('');
  });
  return {
    hasDepartments: true,
    departments,
    selectedDepartments: [
      ...departments.filter((department) => selectedKeys.has(department.key)).map((department) => department.name),
      ...(selectedKeys.has('') && unassignedCount ? [''] : []),
    ],
    selectedRows,
    excludedCount: rows.length - selectedRows.length,
    unassignedCount,
    unassignedSamples,
  };
}

module.exports = { cleanDepartment, departmentKey, inspectDepartments, filterRowsByDepartments };