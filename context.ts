import { EditorState, SelectionRange } from "@codemirror/state";
import * as assert from "assert";

export class Context {
	state: EditorState;

	constructor(state: EditorState) {
		this.state = state;
	}

	private getBoundsAbout(
		positions: readonly number[],
		bounds: readonly ContextToken[]
	): (ContextToken[] | undefined)[] {
		let result: (ContextToken[] | undefined)[] = Array(positions.length);
		let stack: ContextToken[] = [];

		// `positions` must be sorted
		for (let i = 1; i < positions.length; i++) {
			assert(positions[i - 1] <= positions[i]);
		}

		let i_bounds = 0;
		let i_pos = 0;
		let bound_last: ContextToken | undefined = undefined;
		while (true) {
			const pos = bound_last?.to ?? 0;
			while (positions[i_pos] < pos) {
				result[i_pos] = [
					...(bound_last?.type === BoundType.Opening
						? stack.slice(0, -1)
						: stack),
				];
				// terminating condition
				i_pos++;
				if (i_pos >= positions.length) {
					break;
				}
			}

			bound_last = bounds[i_bounds];
			i_bounds++;
			if (bound_last.type === BoundType.Closing) {
				// A closing bound must have a matching opening bound
				// TODO check that bounds are matching
				assert(stack.last()?.type === BoundType.Opening);
				stack.pop();
			} else {
				stack.push();
			}
		}

		return result;
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
	): number {}

	private compareToBounds(bound: ContextToken, position: number): boolean {
		if (bound.type === BoundType.Opening) {
			return position < bound.to;
		} else {
			return position >= bound.from;
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
