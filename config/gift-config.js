const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'gifts.csv');
const allowedMotions = new Set(['throw', 'bloom', 'pulse', 'float', 'sparkle', 'burst']);

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
      continue;
    }

    value += character;
  }

  values.push(value.trim());
  return values;
}

function asBoolean(value) {
  return ['true', '1', 'yes', 'on', '启用'].includes(String(value).toLowerCase());
}

function asGift(row) {
  const colors = [row.color_start, row.color_end];

  if (!row.id || !row.icon || !row.action || !allowedMotions.has(row.motion)) {
    return null;
  }

  if (colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
    return null;
  }

  return {
    id: row.id,
    icon: row.icon,
    name: row.name || row.id,
    action: row.action,
    toast: row.toast || row.action,
    combo: row.combo || row.name || row.id,
    motion: row.motion,
    colors,
    sort: Number(row.sort) || 0
  };
}

function loadGifts() {
  const source = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = source.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  const [header, ...rows] = lines;

  if (!header) {
    return [];
  }

  const columns = parseCsvLine(header);
  const seenIds = new Set();

  return rows
    .map((line) => {
      const values = parseCsvLine(line);
      return columns.reduce((result, column, index) => {
        result[column] = values[index] || '';
        return result;
      }, {});
    })
    .filter((row) => asBoolean(row.enable))
    .map(asGift)
    .filter((gift) => gift && !seenIds.has(gift.id) && seenIds.add(gift.id))
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

module.exports = {
  csvPath,
  loadGifts
};
