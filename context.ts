import { EditorState, SelectionRange } from "@codemirror/state";

export class Context {
	state: EditorState;

	constructor(state: EditorState) {
		this.state = state;
	}

	private getBoundsAbout(
		position: number,
		bounds: ContextToken[]
	): ContextToken[] {
		for (bound of bounds) {
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
		bound_stack: ContextToken[]
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
