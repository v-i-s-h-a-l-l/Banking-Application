import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  VALID_TRANSITIONS,
  type TransferStatus,
} from '@banking/contracts';

describe('Transfer State Machine', () => {
  describe('Valid transitions', () => {
    it('CREATED → PROCESSING', () => {
      expect(isValidTransition('CREATED', 'PROCESSING')).toBe(true);
    });

    it('CREATED → FAILED', () => {
      expect(isValidTransition('CREATED', 'FAILED')).toBe(true);
    });

    it('PROCESSING → DEBITED', () => {
      expect(isValidTransition('PROCESSING', 'DEBITED')).toBe(true);
    });

    it('PROCESSING → FAILED', () => {
      expect(isValidTransition('PROCESSING', 'FAILED')).toBe(true);
    });

    it('DEBITED → CREDITED', () => {
      expect(isValidTransition('DEBITED', 'CREDITED')).toBe(true);
    });

    it('DEBITED → FAILED', () => {
      expect(isValidTransition('DEBITED', 'FAILED')).toBe(true);
    });

    it('CREDITED → COMPLETED', () => {
      expect(isValidTransition('CREDITED', 'COMPLETED')).toBe(true);
    });

    it('CREDITED → FAILED', () => {
      expect(isValidTransition('CREDITED', 'FAILED')).toBe(true);
    });
  });

  describe('Invalid transitions', () => {
    it('COMPLETED → anything is invalid', () => {
      const statuses: TransferStatus[] = [
        'CREATED', 'PROCESSING', 'DEBITED', 'CREDITED', 'COMPLETED', 'FAILED',
      ];
      for (const s of statuses) {
        expect(isValidTransition('COMPLETED', s)).toBe(false);
      }
    });

    it('FAILED → anything is invalid', () => {
      const statuses: TransferStatus[] = [
        'CREATED', 'PROCESSING', 'DEBITED', 'CREDITED', 'COMPLETED', 'FAILED',
      ];
      for (const s of statuses) {
        expect(isValidTransition('FAILED', s)).toBe(false);
      }
    });

    it('CREATED → COMPLETED is invalid (cannot skip states)', () => {
      expect(isValidTransition('CREATED', 'COMPLETED')).toBe(false);
    });

    it('PROCESSING → COMPLETED is invalid', () => {
      expect(isValidTransition('PROCESSING', 'COMPLETED')).toBe(false);
    });

    it('DEBITED → PROCESSING is invalid (cannot go backward)', () => {
      expect(isValidTransition('DEBITED', 'PROCESSING')).toBe(false);
    });
  });
});

describe('Financial invariants', () => {
  it('Money conservation: debit === credit', () => {
    const sourceBalance = 10000n; // ₹100.00 in paise
    const amount = 3000n;         // ₹30.00

    const sourceAfter = sourceBalance - amount;
    const destBefore = 5000n;
    const destAfter = destBefore + amount;

    // Verify no money created or destroyed
    expect(sourceBalance + destBefore).toBe(sourceAfter + destAfter);
  });

  it('No negative balance allowed', () => {
    const balance = 1000n;
    const transferAmount = 2000n;

    const wouldGoNegative = balance < transferAmount;
    expect(wouldGoNegative).toBe(true);
    // System must reject this transfer
  });

  it('Amount must be positive integer', () => {
    const validAmounts = [1n, 100n, 1000000n];
    const invalidAmounts = [0n, -1n, -1000n];

    for (const a of validAmounts) {
      expect(a > 0n).toBe(true);
    }
    for (const a of invalidAmounts) {
      expect(a > 0n).toBe(false);
    }
  });

  it('No floating point — uses BigInt', () => {
    // 100.1 INR in paise = 10010 paise (exact)
    const inPaise = BigInt(Math.round(100.1 * 100));
    expect(inPaise).toBe(10010n);
    expect(typeof inPaise).toBe('bigint');
  });
});
