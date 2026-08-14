import { describe, expect, it } from 'vitest';
import { splitKyotoStreet, isKyotoStreetAddress } from '../src/kyoto.js';

describe('kyoto street extraction', () => {
  it('correctly handles the directional terminators (東入る, 西入る)', () => {
    // Regression test for Defect A: duplicate 東入る|西入る were removed from DIRECTION.
    // These should still be matched correctly.
    const withTouhiru = '京都府京都市中京区烏丸通四条東入る笋町';
    const withNishiiru = '京都府京都市中京区烏丸通四条西入る笋町';

    expect(isKyotoStreetAddress(withTouhiru)).toBe(true);
    expect(isKyotoStreetAddress(withNishiiru)).toBe(true);

    const splitTouhiru = splitKyotoStreet(withTouhiru);
    const splitNishiiru = splitKyotoStreet(withNishiiru);

    expect(splitTouhiru.street).toBe('烏丸通四条東入る');
    expect(splitTouhiru.rest).toContain('笋町');

    expect(splitNishiiru.street).toBe('烏丸通四条西入る');
    expect(splitNishiiru.rest).toContain('笋町');
  });

  it('correctly handles other directional variants', () => {
    // Verify that the common directional terminators still work after de-duplication.
    const variants = [
      { input: '京都府京都市中京区烏丸通四条上ル笋町', expectedStreet: '烏丸通四条上ル' },
      { input: '京都府京都市中京区烏丸通四条上る笋町', expectedStreet: '烏丸通四条上る' },
      { input: '京都府京都市中京区烏丸通四条下ル笋町', expectedStreet: '烏丸通四条下ル' },
      { input: '京都府京都市中京区烏丸通四条東入ル笋町', expectedStreet: '烏丸通四条東入ル' },
      { input: '京都府京都市中京区烏丸通四条東入笋町', expectedStreet: '烏丸通四条東入' },
      { input: '京都府京都市中京区烏丸通四条西入ル笋町', expectedStreet: '烏丸通四条西入ル' },
      { input: '京都府京都市中京区烏丸通四条西入笋町', expectedStreet: '烏丸通四条西入' },
    ];

    for (const { input, expectedStreet } of variants) {
      const result = splitKyotoStreet(input);
      expect(result.street, `Failed for input: ${input}`).toBe(expectedStreet);
    }
  });
});
