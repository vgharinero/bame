import { describe, expect, it } from 'vitest';
import { consoleStyle, formatBox, visibleLength } from './index';

describe('@bame/ui-console visual helpers', () => {
	it('calculates visibleLength ignoring ANSI escape sequences', () => {
		const colored = consoleStyle.bold(consoleStyle.cyan('Hello Bame'));
		expect(visibleLength(colored)).toBe('Hello Bame'.length);
	});

	it('renders rounded Unicode box with title and aligned borders', () => {
		const box = formatBox(['Line 1', 'Second longer line'], {
			title: 'Turn #1',
		});
		expect(box).toContain('╭─');
		expect(box).toContain('Turn #1');
		expect(box).toContain('Line 1');
		expect(box).toContain('Second longer line');
		expect(box).toContain('╰─');
	});
});
