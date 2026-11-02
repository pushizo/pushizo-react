/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (pkg: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../${pkg}/src/binding.ts`, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');

describe('çerçeve paketleri ortak çekirdeği', () => {
  it('binding.ts react, vue ve angular paketlerinde aynı içerikte', () => {
    const react = read('react');
    expect(read('vue')).toBe(react);
    expect(read('angular')).toBe(react);
  });
});
