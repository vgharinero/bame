# Test Structure Guide

A reusable template for writing effective TypeScript tests with Vitest.

## Core Principles

### Focus on Behavior, Not Implementation
- Test **what the code does**, not **what it is**
- TypeScript already catches type errors - tests should verify runtime behavior
- Verify contracts, edge cases, and business logic correctness
- Use type assertions to ensure APIs return expected types

### Good Test Structure
```typescript
describe('ClassName or ModuleName', () => {
  describe('methodName or feature', () => {
    it('should describe the expected behavior', () => {
      // Arrange
      const instance = new ClassName(params);

      // Act
      const result = instance.method();

      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

## Test Categories to Cover

### 1. Constructor/Initialization
❌ **Don't just check instance types:**
```typescript
it('should create instance', () => {
  const instance = new MyClass();
  expect(instance).toBeInstanceOf(MyClass); // Too weak!
});
```

✅ **Do verify behavior:**
```typescript
it('should initialize and produce expected behavior', () => {
  const instance1 = new MyClass(seed);
  const instance2 = new MyClass(seed);

  expect(instance1.getValue()).toBe(instance2.getValue());
});

it('should handle edge case inputs', () => {
  const instance = new MyClass(0);
  const value = instance.getValue();

  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThan(max);
});
```

### 2. Core Contracts & Invariants
Test the fundamental promises your code makes:
```typescript
describe('determinism', () => {
  it('should produce same results for same inputs', () => {
    const result1 = processData(input);
    const result2 = processData(input);

    expect(result1).toEqual(result2);
  });

  it('should produce different results for different inputs', () => {
    const result1 = processData(input1);
    const result2 = processData(input2);

    expect(result1).not.toEqual(result2);
  });
});
```

### 3. Range & Boundary Testing
Verify outputs stay within expected bounds:
```typescript
describe('rangeMethod', () => {
  it('should return values within specified range', () => {
    for (let i = 0; i < 100; i++) {
      const value = instance.getValue(min, max);
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    }
  });

  it('should include boundary values over many calls', () => {
    const values = new Set<number>();

    for (let i = 0; i < 1000; i++) {
      values.add(instance.getValue(1, 3));
    }

    expect(values.has(1)).toBe(true);
    expect(values.has(3)).toBe(true);
  });
});
```

### 4. Edge Cases
Test boundary conditions and special inputs:
```typescript
describe('edge cases', () => {
  it('should handle empty input', () => {
    expect(() => instance.process([])).toThrow('Expected error message');
  });

  it('should handle single element', () => {
    const result = instance.process([single]);
    expect(result).toBe(expectedValue);
  });

  it('should handle zero values', () => {
    const result = instance.calculate(0);
    expect(result).toBe(expectedValue);
  });

  it('should handle negative values', () => {
    const result = instance.calculate(-5);
    expect(result).toBeGreaterThanOrEqual(expectedMin);
  });

  it('should handle maximum values', () => {
    const result = instance.process(MAX_SAFE_INTEGER);
    expect(result).toBeDefined();
  });
});
```

### 5. Error Handling
Verify proper error behavior:
```typescript
describe('error handling', () => {
  it('should throw descriptive error for invalid input', () => {
    expect(() => instance.process(invalid))
      .toThrow('Cannot select from empty array');
  });

  it('should not throw for valid edge cases', () => {
    expect(() => instance.process(validEdgeCase))
      .not.toThrow();
  });
});
```

### 6. Type Safety
Verify generic types and return types:
```typescript
describe('type safety', () => {
  it('should maintain type information', () => {
    const stringResult: string = instance.choice(['a', 'b', 'c']);
    const numberResult: number = instance.choice([1, 2, 3]);
    const objectResult: MyType = instance.choice([obj1, obj2]);

    expect(typeof stringResult).toBe('string');
    expect(typeof numberResult).toBe('number');
    expect(objectResult).toHaveProperty('expectedKey');
  });
});
```

### 7. Distribution & Statistical Properties
For randomness, algorithms, or sampling:
```typescript
describe('distribution', () => {
  it('should distribute values relatively evenly', () => {
    const counts = new Map<number, number>();
    const samples = 10000;

    for (let i = 0; i < samples; i++) {
      const value = instance.nextInt(1, 5);
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    // Each value should appear ~20% of the time (±5%)
    for (const count of counts.values()) {
      const frequency = count / samples;
      expect(frequency).toBeGreaterThan(0.15);
      expect(frequency).toBeLessThan(0.25);
    }
  });
});
```

### 8. State Management
For stateful objects:
```typescript
describe('state management', () => {
  it('should preserve state correctly', () => {
    instance.setState(value);
    expect(instance.getState()).toBe(value);
  });

  it('should restore to previous state', () => {
    const state = instance.getState();
    instance.next();
    instance.setState(state);

    const sequence1 = getSequence();
    instance.setState(state);
    const sequence2 = getSequence();

    expect(sequence1).toEqual(sequence2);
  });
});
```

### 9. Mutation vs Immutability
Verify expected mutation behavior:
```typescript
describe('mutation behavior', () => {
  it('should mutate the original array', () => {
    const array = [1, 2, 3];
    const result = instance.shuffle(array);

    expect(result).toBe(array); // Same reference
  });

  it('should not mutate the original', () => {
    const original = [1, 2, 3];
    const copy = [...original];
    const result = instance.process(copy);

    expect(original).toEqual([1, 2, 3]); // Unchanged
  });
});
```

## Common Patterns

### Testing Collections
```typescript
it('should contain all original elements', () => {
  const original = [1, 2, 3, 4, 5];
  const result = instance.process([...original]);

  expect(result).toHaveLength(original.length);
  expect([...result].sort()).toEqual([...original].sort());
});

it('should eventually include all elements over many calls', () => {
  const array = [1, 2, 3, 4, 5];
  const selected = new Set<number>();

  for (let i = 0; i < 100; i++) {
    selected.add(instance.choice(array));
  }

  expect(selected.size).toBe(5);
});
```

### Testing Probabilities
```typescript
it('should approximate expected probability', () => {
  const probability = 0.7;
  const samples = 10000;
  let successCount = 0;

  for (let i = 0; i < samples; i++) {
    if (instance.boolean(probability)) {
      successCount++;
    }
  }

  const actual = successCount / samples;
  expect(actual).toBeGreaterThan(0.65); // ±5% tolerance
  expect(actual).toBeLessThan(0.75);
});
```

### Testing Uniqueness
```typescript
it('should produce unique values on consecutive calls', () => {
  const values = new Set<number>();

  for (let i = 0; i < 100; i++) {
    values.add(instance.next());
  }

  // Allow some collisions but expect mostly unique
  expect(values.size).toBeGreaterThan(90);
});
```

## Test Organization

### Describe Block Hierarchy
```typescript
describe('ClassName', () => {
  describe('constructor', () => { /* ... */ });
  describe('staticMethod', () => { /* ... */ });

  describe('feature or method group', () => {
    describe('subfeature', () => { /* ... */ });
  });

  describe('edge cases', () => { /* ... */ });
  describe('error handling', () => { /* ... */ });
  describe('type safety', () => { /* ... */ });
});
```

### Test Naming Convention
Use descriptive "should" statements:
- ✅ `it('should return values within specified range', ...)`
- ✅ `it('should throw error for empty array', ...)`
- ✅ `it('should maintain type information', ...)`
- ❌ `it('works', ...)`
- ❌ `it('test nextInt', ...)`

## What NOT to Test

- **Don't test TypeScript's type system** - it already does that
- **Don't test implementation details** - test behavior and contracts
- **Don't test third-party libraries** - assume they work
- **Don't duplicate tests** - one test per behavior/edge case

## Quick Checklist

When writing tests for a class/module, ask:

- [ ] Does it verify the core contract/behavior?
- [ ] Does it test edge cases (empty, zero, negative, max)?
- [ ] Does it test error conditions?
- [ ] Does it verify boundary values are included?
- [ ] For stateful code: Does it test state management?
- [ ] For random/statistical code: Does it test distribution?
- [ ] For collections: Does it test mutation behavior?
- [ ] Does it verify type safety for generics?
- [ ] Are test names descriptive?
- [ ] Can tests run independently?

## Example: Complete Test Suite Structure

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from './my-class';

describe('MyClass', () => {
  describe('constructor', () => {
    it('should initialize and produce expected behavior', () => {
      // Test actual behavior, not just instance type
    });

    it('should handle edge case inputs', () => {
      // Zero, negative, max values, etc.
    });
  });

  describe('core contracts', () => {
    it('should maintain fundamental invariant', () => {
      // Test the promises your code makes
    });
  });

  describe('methodName', () => {
    it('should perform expected operation', () => {
      // Happy path
    });

    it('should handle edge cases', () => {
      // Boundary conditions
    });

    it('should validate inputs', () => {
      // Error cases
    });
  });

  describe('edge cases', () => {
    // All boundary conditions grouped
  });

  describe('error handling', () => {
    // All error cases grouped
  });

  describe('type safety', () => {
    // Generic type preservation
  });
});
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test filename.test.ts

# Run in watch mode
pnpm test --watch

# Run with UI
pnpm test:ui

# Run with coverage
pnpm test --coverage
```

---

**Remember:** Good tests verify behavior, handle edge cases, and provide confidence that your code works correctly - not just that TypeScript compiles.
