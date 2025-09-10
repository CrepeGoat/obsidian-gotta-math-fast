import { EditorState, SelectionRange } from "@codemirror/state";
import * as assert from "assert";

export class Context {
	state: EditorState;

	constructor(state: EditorState) {
		this.state = state;
	}

	private getBoundsAbout(
		bounds: readonly ContextToken[],
		bound_indices: readonly number[]
	): (ContextToken[] | undefined)[] {
		let result: (ContextToken[] | undefined)[] = Array(
			bound_indices.length
		);
		let stack: ContextToken[] = [];

		this.assertIsSorted(bound_indices);

		let i_pos = 0;
		for (let i_bound = 0; ; i_bound++) {
			while (i_bound === bound_indices[i_pos]) {
				result[i_pos] = [...stack];
				i_pos++;
				if (i_pos >= bound_indices.length) {
					return result;
				}
			}
			// the positions should run out before the bounds -> this shouldn't trigger
			assert(i_bound >= bounds.length);

			const bound = bounds[i_bound];
			if (bound.type === BoundType.Closing) {
				// A closing bound must have a matching opening bound
				// TODO check that bounds are matching
				assert(stack.last()?.type === BoundType.Opening);
				stack.pop();
			} else {
				stack.push();
			}
		}
	}

	private bisectPositionsToBounds(
		bounds: readonly ContextToken[],
		positions: readonly number[]
	): number[] {
		if (positions.length === 0) {
			return [];
		}

		const i_pos_mid = positions.length / 2;
		const i_map_to_bounds = this.bisectBounds(bounds, i_pos_mid);

		return [
			...this.bisectPositionsToBounds(
				bounds.slice(0, i_map_to_bounds + 1), // include middle bound
				positions.slice(0, i_pos_mid) // exclude middle position
			),
			i_map_to_bounds,
			...this.bisectPositionsToBounds(
				bounds.slice(i_map_to_bounds), // include middle bound
				positions.slice(i_pos_mid + 1) // exclude middle position
			).map((pos) => pos + i_map_to_bounds),
		];
	}

	private bisectBounds(
		bounds: readonly ContextToken[],
		position: number
	): number {
		if (bounds.length === 0) {
			return 0;
		}

		const i_bound_mid = bounds.length / 2;
		const cmp = this.compareToBounds(bounds[i_bound_mid], position);
		if (cmp) {
			return this.bisectBounds(bounds.slice(0, i_bound_mid), position);
		} else {
			return (
				this.bisectBounds(bounds.slice(i_bound_mid + 1), position) +
				i_bound_mid +
				1
			);
		}
	}

	private compareToBounds(bound: ContextToken, position: number): boolean {
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

	private assertIsSorted(array: readonly number[]) {
		for (let i = 1; i < array.length; i++) {
			assert(array[i - 1] <= array[i]);
		}
	}

	private scanBounds(): ContextToken[] {
		let result: ContextToken[] = [];

		let i_doc = 0;
		while (i_doc < this.state.doc.length) {
			// scan for bounds (also increments i_doc)
			for (let bound_text of ["$$", "$", "\n", undefined]) {
				// terminating condition
				if (bound_text === undefined) {
					i_doc++;
					break;
				}

				if (
					this.state.doc.sliceString(
						i_doc,
						i_doc + bound_text.length
					) !== bound_text
				) {
					continue;
				}

				let last_bound_text = result.last()?.text(this.state);
				if (last_bound_text === "$" && bound_text === "\n") {
					// a `$` terminated with a newline is not a bound
					result.pop();
					continue;
				}

				let bound_type: BoundType;
				if (last_bound_text === bound_text) {
					bound_type = BoundType.Closing;
				} else {
					bound_type = BoundType.Opening;
				}

				result.push(
					new ContextToken(
						i_doc,
						i_doc + bound_text.length,
						bound_type
					)
				);

				// make sure not to interpret the same bound multiple times
				i_doc = i_doc + bound_text.length;
				break;
			}
		}

		return result;
	}

	private getMajorType(
		state: EditorState,
		bound_stack: readonly ContextToken[]
	): MajorContextTypes {
		let result = MajorContextTypes.Text;
		for (let bound of bound_stack) {
			const text = bound.text(state);
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

	public text(state: EditorState): string {
		return state.doc.sliceString(this.from, this.to);
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
