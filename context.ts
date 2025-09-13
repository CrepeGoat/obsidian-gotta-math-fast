import { EditorState, SelectionRange, Text } from "@codemirror/state";
import { strict as assert } from "assert";

export function getContextTypeAtSelection(
	doc: Text,
	ranges: readonly SelectionRange[]
): MajorContextTypes[] {
	const bounds = parseContextTokens(doc);
	console.log("context tokens: ", bounds);

	const positions = ranges.flatMap((range) => [range.from, range.to]);
	const pos_bound_indices = bisectPositionsToBounds(bounds, positions);
	const pos_bound_stacks = getBoundsAbout(bounds, pos_bound_indices);

	let range_bound_stacks = [];
	for (let i = 1; i < pos_bound_stacks.length; i = i + 2) {
		range_bound_stacks.push(
			longestCommonPrefix(pos_bound_stacks[i - 1]!, pos_bound_stacks[i]!)
		);
	}

	return range_bound_stacks.map((x) => getMajorType(doc, x));
}

function getMajorType(
	doc: Text,
	bound_stack: readonly ContextToken[]
): MajorContextTypes {
	let result = MajorContextTypes.Text;
	for (let bound of bound_stack) {
		const text = bound.text(doc);
		if (result === MajorContextTypes.Math && text === "\\text{") {
			result = MajorContextTypes.Text;
			continue;
		}
		if (
			result === MajorContextTypes.Text &&
			(text === "$$" || text === "$")
		) {
			result = MajorContextTypes.Math;
			continue;
		}
	}

	return result;
}

function longestCommonPrefix<T>(a1: readonly T[], a2: readonly T[]): T[] {
	let i = 0;
	for (; ; i++) {
		if (i >= a1.length || i >= a2.length) break;
		if (a1[i] !== a2[i]) break;
	}
	return [...a1.slice(0, i)];
}

function getBoundsAbout(
	bounds: readonly ContextToken[],
	bound_indices: readonly number[]
): ContextToken[][] {
	let result: (ContextToken[] | undefined)[] = Array.from(
		Array(bound_indices.length)
	);
	let stack: ContextToken[] = [];

	assertIsSorted(bound_indices);

	let i_pos = 0;
	for (let i_bound = 0; ; i_bound++) {
		while (i_bound === bound_indices[i_pos]) {
			result[i_pos] = [...stack];
			i_pos++;
			if (i_pos >= bound_indices.length) {
				return result.map((x) => x!);
			}
		}
		// the positions should run out before the bounds -> this shouldn't trigger
		assert(i_bound < bounds.length);

		const bound = bounds[i_bound]!;
		if (bound.type === BoundType.Closing) {
			// A closing bound must have a matching opening bound
			// TODO check that bounds are matching
			assert(
				stack.last()?.type ?? BoundType.Opening === BoundType.Opening
			);
			stack.pop();
		} else {
			stack.push();
		}
	}
}

function bisectPositionsToBounds(
	bounds: readonly ContextToken[],
	positions: readonly number[]
): number[] {
	if (positions.length === 0) {
		return [];
	}

	const i_pos_mid = Math.floor(positions.length / 2);
	const i_map_to_bounds = bisectBounds(bounds, positions[i_pos_mid]!);

	return [
		...bisectPositionsToBounds(
			bounds.slice(0, i_map_to_bounds + 1), // include middle bound
			positions.slice(0, i_pos_mid) // exclude middle position
		),
		i_map_to_bounds,
		...bisectPositionsToBounds(
			bounds.slice(i_map_to_bounds), // include middle bound
			positions.slice(i_pos_mid + 1) // exclude middle position
		).map((pos: number) => pos + i_map_to_bounds),
	];
}

function bisectBounds(
	bounds: readonly ContextToken[],
	position: number
): number {
	if (bounds.length === 0) {
		return 0;
	}

	const i_bound_mid = Math.floor(bounds.length / 2);
	const cmp = compareToBounds(bounds[i_bound_mid]!, position);
	if (cmp) {
		return bisectBounds(bounds.slice(0, i_bound_mid), position);
	} else {
		return (
			bisectBounds(bounds.slice(i_bound_mid + 1), position) +
			i_bound_mid +
			1
		);
	}
}

function compareToBounds(bound: ContextToken, position: number): boolean {
	// TODO 2x-check logic
	// a position that interrupts a brace should be considered outside its bounded region
	if (bound.type === BoundType.Opening) {
		// outside = before
		return position < bound.to;
	} else {
		// outside = after
		return position <= bound.from;
	}
}

function assertIsSorted(array: readonly number[]) {
	for (let i = 1; i < array.length; i++) {
		assert(array[i - 1]! <= array[i]!);
	}
}

function parseContextTokens(doc: Text): ContextToken[] {
	let result: ContextToken[] = [];
	let stack: ContextToken[] = [];

	let i_doc = 0;
	while (i_doc < doc.length) {
		// scan for bounds (also increments i_doc)
		for (let bound_text of ["$$", "$", "\n", undefined]) {
			// terminating condition
			if (bound_text === undefined) {
				i_doc++;
				break;
			}

			if (
				doc.sliceString(i_doc, i_doc + bound_text.length) !== bound_text
			) {
				continue;
			}

			let last_bound_text = result.last()?.text(doc);
			if (last_bound_text === "$$" && bound_text === "$") {
				continue;
			}
			if (bound_text === "\n") {
				if (last_bound_text === "$") {
					// a `$` terminated with a newline is not a bound
					result.pop();
				}
				// newlines are not a bound -> ignore
				continue;
			}

			let bound_type: BoundType;
			if (
				pushToBoundStack(
					stack,
					doc,
					i_doc,
					i_doc + bound_text.length
				) == null
			) {
				bound_type = BoundType.Opening;
			} else {
				bound_type = BoundType.Closing;
			}

			result.push(
				new ContextToken(i_doc, i_doc + bound_text.length, bound_type)
			);

			// make sure not to interpret the same bound multiple times
			i_doc = i_doc + bound_text.length;
			break;
		}
	}

	return result;
}

function pushToBoundStack(
	stack: ContextToken[],
	doc: Text,
	from: number,
	to: number
): ContextToken | undefined {
	const text = doc.sliceString(from, to);
	const last_bound = stack.last;
	if (
		stack.last()?.type === BoundType.Opening &&
		stack.last()?.text(doc) === text
	) {
		return stack.pop();
	} else {
		stack.push(new ContextToken(from, to, BoundType.Opening));
	}
}

class ContextToken {
	from: number;
	to: number;
	type: BoundType;

	constructor(from: number, to: number, type: BoundType) {
		this.from = from;
		this.to = to;
		this.type = type;
	}

	public text(doc: Text): string {
		return doc.sliceString(this.from, this.to);
	}
}

export enum MajorContextTypes {
	Text,
	Math,
}

enum BoundType {
	Opening,
	Closing,
}
