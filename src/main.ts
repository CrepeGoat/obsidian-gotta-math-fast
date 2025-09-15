import {
	ChangeDesc,
	EditorSelection,
	Extension,
	Prec,
	SelectionRange,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { getContextTypeAtSelection, MajorContextTypes } from "src/context";

interface FastMatherSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: FastMatherSettings = {
	mySetting: "default",
};

export default class FastMather extends Plugin {
	settings: FastMatherSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"dice",
			"Sample Plugin",
			(evt: MouseEvent) => {
				// Called when the user clicks the icon.
				new Notice("This is a notice!");
			}
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-sample-modal-simple",
			name: "Open sample modal (simple)",
			callback: () => {
				new SampleModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "sample-editor-command",
			name: "Sample editor command",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection("Sample Editor Command");
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("click", evt);
		});

		this.registerDomEvent(document, "beforeinput", (evt: InputEvent) => {
			console.log("mod text", evt);
		});

		// from https://github.com/artisticat1/obsidian-latex-suite/blob/ce31511a47949e3d4d0b3a43444949fd5a6a69f6/src/main.ts#L163-L168
		this.registerEditorExtension(
			Prec.highest(
				EditorView.domEventHandlers({
					keydown: (evt, view) => {
						this.onBeforeInput(evt, view);
					},
				})
			)
		);

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		);
	}

	onunload() {}

	// from https://github.com/artisticat1/obsidian-latex-suite/blob/ce31511a47949e3d4d0b3a43444949fd5a6a69f6/src/latex_suite.ts#L31
	onBeforeInput(event: KeyboardEvent, view: EditorView) {
		const success = this.handleBeforeInput(
			event.key,
			event.shiftKey,
			event.ctrlKey || event.metaKey,
			this.isComposing(view, event),
			view
		);

		if (success) event.preventDefault();
	}

	// from https://github.com/artisticat1/obsidian-latex-suite/blob/ce31511a47949e3d4d0b3a43444949fd5a6a69f6/src/latex_suite.ts#L37
	handleBeforeInput(
		key: string,
		shiftKey: boolean,
		ctrlKey: boolean,
		isIME: boolean,
		view: EditorView
	) {
		const main_selection = view.state.selection.main;
		const [context_type, bound] = getContextTypeAtSelection(
			view.state.doc,
			[main_selection]
		)[0]!;
		if (context_type === MajorContextTypes.Math) {
			if (key === "Tab") {
				if (bound != undefined) {
					let new_pos: number = view.state.doc.length;
					if (bound.closing != undefined) {
						if (
							main_selection.from === main_selection.to &&
							main_selection.from === bound.closing.from
						) {
							new_pos = bound.closing.to;
						} else {
							new_pos = bound.closing.from;
						}
					}
					view.dispatch({
						// https://codemirror.net/docs/guide/#selection
						selection: EditorSelection.create([
							EditorSelection.cursor(new_pos),
						]),
					});
					return true;
				}
			}
			return false;
		}

		if (shiftKey) {
			return false;
		}

		if (key === " ") {
			// from https://github.com/artisticat1/obsidian-latex-suite/blob/ce31511a47949e3d4d0b3a43444949fd5a6a69f6/src/utils/editor_utils.ts#L12
			const cursorPos = view.state.selection.main.to;
			const doc = view.state.doc;

			const chars = doc.sliceString(
				Math.max(cursorPos - 3, 0),
				cursorPos
			);

			// TODO disallow expansions for text followed by non-whitespace
			if (
				doc
					.sliceString(
						Math.max(cursorPos - 2, 0),
						Math.max(cursorPos - 1, 0)
					)
					.trim() === "" &&
				doc.sliceString(Math.max(cursorPos - 1, 0), cursorPos) === "m"
			) {
				this.replaceRange(view, cursorPos - 1, cursorPos, "$$", 1);
				return true;
			} else if (
				doc
					.sliceString(
						Math.max(cursorPos - 3, 0),
						Math.max(cursorPos - 2, 0)
					)
					.trim() === "" &&
				doc.sliceString(Math.max(cursorPos - 2, 0), cursorPos) === "mm"
			) {
				this.replaceRange(
					view,
					cursorPos - 2,
					cursorPos,
					"$$\n\n$$\n",
					"$$\n".length
				);
				return true;
			} else if (
				doc
					.sliceString(
						Math.max(cursorPos - 3, 0),
						Math.max(cursorPos - 2, 0)
					)
					.trim() === "" &&
				doc.sliceString(Math.max(cursorPos - 2, 0), cursorPos) === "ma"
			) {
				this.replaceRange(
					view,
					cursorPos - 2,
					cursorPos,
					"$$\n\\begin{align}\n\n\\end{align}\n$$\n",
					"$$\n\\begin{align}\n".length
				);
				return true;
			}
		}
		return false;
	}

	// from https://github.com/artisticat1/obsidian-latex-suite/blob/ce31511a47949e3d4d0b3a43444949fd5a6a69f6/src/utils/editor_utils.ts#L6
	replaceRange(
		view: EditorView,
		start: number,
		end: number,
		replacement: string,
		newPos: number | undefined
	) {
		newPos = newPos ?? replacement.length;
		view.dispatch({
			changes: { from: start, to: end, insert: replacement },
			// https://codemirror.net/docs/guide/#selection
			selection: EditorSelection.create([
				EditorSelection.cursor(start + newPos),
			]),
		});
	}

	/**
	 * Check if the user is typing in an IME composition.
	 * Returns true even if the given event is the first keydown event of an IME composition.
	 */
	// from https://github.com/artisticat1/obsidian-latex-suite/blob/ce31511a47949e3d4d0b3a43444949fd5a6a69f6/src/utils/editor_utils.ts#L136
	isComposing(view: EditorView, event: KeyboardEvent): boolean {
		// view.composing and event.isComposing are false for the first keydown event of an IME composition,
		// so we need to check for event.keyCode === 229 to prevent IME from triggering keydown events.
		// Note that keyCode is deprecated - it is used here because it is apparently the only way to detect the first keydown event of an IME composition.
		return view.composing || event.keyCode === 229;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: FastMather;

	constructor(app: App, plugin: FastMather) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
