import { _get, _post, _delete, _download, _upload, toggleLoader, addLoader, removeLoader, insertText, toClipboard, toDateString } from "../modules/common.js";
import { Marked } from "@ts-stack/markdown";
import { stripMarkdown } from "../modules/stripmd.js";

interface BackupDTO {
    size: string;
    name: string;
    path: string;
    date: number;
}

interface settingsBoolEvent extends Event { 
    detail: boolean;
}

interface Meta {
    name: string;
    description: string;
    advanced?: boolean;
    depends_true?: string;
    depends_false?: string;
    wiki_link?: string;
}

interface Setting {
    name: string;
    description: string;
    required: boolean;
    requires_restart: boolean;
    advanced?: boolean;
    type: string;
    value: string | boolean | number | string[];
    depends_true?: string;
    depends_false?: string;
    wiki_link?: string;
    deprecated?: boolean;

    asElement: () => HTMLElement;
    update: (s: Setting) => void;

    hide: () => void;
    show: () => void;

    valueAsString: () => string;
}

const splitDependant = (section: string, dep: string): string[] => {
    let parts = dep.split("|");
    if (parts.length == 1) {
        parts = [section, dep];
    }
    return parts
};

class DOMInput {
    protected _input: HTMLInputElement;
    protected _container: HTMLDivElement;
    protected _tooltip: HTMLDivElement;
    protected _required: HTMLSpanElement;
    protected _restart: HTMLSpanElement;
    protected _advanced: boolean;
    protected _section: string;
    protected _name: string;

    hide = () => {
        this._input.parentElement.classList.add("unfocused");
        const event = new CustomEvent(`settings-${this._section}-${this._name}`, { "detail": false })
        document.dispatchEvent(event);

    };
    show = () => {
        this._input.parentElement.classList.remove("unfocused");
        const event = new CustomEvent(`settings-${this._section}-${this._name}`, { "detail": this.valueAsString() })
        document.dispatchEvent(event);
    };

    private _advancedListener = (event: settingsBoolEvent) => {
        if (!Boolean(event.detail)) {
            this.hide();
        } else {
            this.show();
        }
    }

    get advanced(): boolean { return this._advanced; }
    set advanced(advanced: boolean) {
        this._advanced = advanced;
        if (advanced) {
            document.addEventListener("settings-advancedState", this._advancedListener);
        } else {
            document.removeEventListener("settings-advancedState", this._advancedListener);
        }
    }

    get name(): string { return this._container.querySelector("span.setting-label").textContent; }
    set name(n: string) { this._container.querySelector("span.setting-label").textContent = n; }

    get description(): string { return this._tooltip.querySelector("span.content").textContent; } 
    set description(d: string) {
        const content = this._tooltip.querySelector("span.content") as HTMLSpanElement;
        content.textContent = d;
        if (d == "") {
            this._tooltip.classList.add("unfocused");
        } else {
            this._tooltip.classList.remove("unfocused");
        }
    }

    get required(): boolean { return this._required.classList.contains("badge"); }
    set required(state: boolean) {
        if (state) {
            this._required.classList.add("badge", "~critical");
            this._required.textContent = "*";
        } else {
            this._required.classList.remove("badge", "~critical");
            this._required.textContent = "";
        }
    }
    
    get requires_restart(): boolean { return this._restart.classList.contains("badge"); }
    set requires_restart(state: boolean) {
        if (state) {
            this._restart.classList.add("badge", "~info", "dark:~d_warning");
            this._restart.textContent = "R";
        } else {
            this._restart.classList.remove("badge", "~info", "dark:~d_warning");
            this._restart.textContent = "";
        }
    }

    valueAsString = (): string => { return ""+this.value; };

    onValueChange = () => {
        const event = new CustomEvent(`settings-${this._section}-${this._name}`, { "detail": this.valueAsString() })
        const setEvent = new CustomEvent(`settings-set-${this._section}-${this._name}`, { "detail": this.valueAsString() })
        document.dispatchEvent(event);
        document.dispatchEvent(setEvent);
        if (this.requires_restart) { document.dispatchEvent(new CustomEvent("settings-requires-restart")); }
    };

    constructor(inputType: string, setting: Setting, section: string, name: string, customInput?: string) {
        this._section = section;
        this._name = name;
        this._container = document.createElement("div");
        this._container.classList.add("setting");
        this._container.setAttribute("data-name", name)
        const defaultInput = `
            <input type="${inputType}" class="input setting-input ~neutral @low mt-2 mb-2">
        `;
        this._container.innerHTML = `
        <label class="label">
            <span class="setting-label"></span> <span class="setting-required"></span> <span class="setting-restart"></span>
            <div class="setting-tooltip tooltip right unfocused">
                <i class="icon ri-information-line"></i>
                <span class="content sm"></span>
            </div>
            ${customInput ? customInput : defaultInput}
        </label>
        `;
        this._tooltip = this._container.querySelector("div.setting-tooltip") as HTMLDivElement;
        this._required = this._container.querySelector("span.setting-required") as HTMLSpanElement;
        this._restart = this._container.querySelector("span.setting-restart") as HTMLSpanElement;
        this._input = this._container.querySelector(".setting-input") as HTMLInputElement;
        if (setting.depends_false || setting.depends_true) {
            let dependant = splitDependant(section, setting.depends_true || setting.depends_false);
            let state = true;
            if (setting.depends_false) { state = false; }
            document.addEventListener(`settings-${dependant[0]}-${dependant[1]}`, (event: settingsBoolEvent) => {
                if (Boolean(event.detail) !== state) {
                    this.hide();
                } else {
                    this.show();
                }
            });
        }
        this._input.onchange = this.onValueChange;
        this.update(setting);
    }

    get value(): any { return this._input.value; }
    set value(v: any) { this._input.value = v; }

    update = (s: Setting) => {
        this.name = s.name;
        this.description = s.description;
        this.required = s.required;
        this.requires_restart = s.requires_restart;
        this.value = s.value;
        this.advanced = s.advanced;
    }
    
    asElement = (): HTMLDivElement => { return this._container; }
}

interface SText extends Setting {
    value: string;
}
class DOMText extends DOMInput implements SText {
    constructor(setting: Setting, section: string, name: string) { super("text", setting, section, name); }
    type: string = "text";
    get value(): string { return this._input.value }
    set value(v: string) { this._input.value = v; }
}

interface SList extends Setting {
    value: string[];
}

class DOMList extends DOMInput implements SList {
    protected _inputs: HTMLDivElement;
    type: string = "list";
    
    valueAsString = (): string => { return this.value.join("|"); };

    get value(): string[] {
        let values = [];
        const inputs = this._input.querySelectorAll("input") as NodeListOf<HTMLInputElement>;
        for (let i in inputs) {
            if (inputs[i].value) values.push(inputs[i].value);
        }
        return values;
    }
    set value(v: string[]) {
        this._input.textContent = ``;
        for (let val of v) {
            let input = this.inputRow(val);
            this._input.appendChild(input);
        }
        const addDummy = () => {
            const dummyRow = this.inputRow();
            const input = dummyRow.querySelector("input") as HTMLInputElement;
            input.placeholder = window.lang.strings("add");
            const onDummyChange = () => {
                if (!(input.value)) return;
                addDummy();
                input.removeEventListener("change", onDummyChange);
                input.placeholder = ``;
            }
            input.addEventListener("change", onDummyChange);
            this._input.appendChild(dummyRow);
        };
        addDummy();
    }

    private inputRow(v: string = ""): HTMLDivElement {
        let container = document.createElement("div") as HTMLDivElement;
        container.classList.add("flex", "flex-row", "justify-between");
        container.innerHTML = `
            <input type="text" class="input ~neutral @low">
            <button class="button ~neutral @low center -ml-10 rounded-s-none aria-label="${window.lang.strings("delete")}" title="${window.lang.strings("delete")}">
                <i class="ri-close-line"></i>
            </button>
        `;
        const input = container.querySelector("input") as HTMLInputElement;
        input.value = v;
        input.onchange = this.onValueChange;
        const removeRow = container.querySelector("button") as HTMLButtonElement;
        removeRow.onclick = () => {
            if (!(container.nextElementSibling)) return;
            container.remove();
            this.onValueChange();
        }
        return container;
    }

    update = (s: Setting) => {
        this.name = s.name;
        this.description = s.description;
        this.required = s.required;
        this.requires_restart = s.requires_restart;
        this.value = s.value as string[];
        this.advanced = s.advanced;
    }
    
    asElement = (): HTMLDivElement => { return this._container; }

    constructor(setting: Setting, section: string, name: string) {
        super("list", setting, section, name,
            `<div class="setting-input flex flex-col gap-2 mt-2 mb-2"></div>`
        );
    }
}

interface SPassword extends Setting {
    value: string;
}
class DOMPassword extends DOMInput implements SPassword {
    constructor(setting: Setting, section: string, name: string) { super("password", setting, section, name); }
    type: string = "password";
    get value(): string { return this._input.value }
    set value(v: string) { this._input.value = v; }
}

interface SEmail extends Setting {
    value: string;
}
class DOMEmail extends DOMInput implements SEmail {
    constructor(setting: Setting, section: string, name: string) { super("email", setting, section, name); }
    type: string = "email";
    get value(): string { return this._input.value }
    set value(v: string) { this._input.value = v; }
}

interface SNumber extends Setting {
    value: number;
}
class DOMNumber extends DOMInput implements SNumber {
    constructor(setting: Setting, section: string, name: string) { super("number", setting, section, name); }
    type: string = "number";
    get value(): number { return +this._input.value; }
    set value(v: number) { this._input.value = ""+v; }
}

interface SBool extends Setting {
    value: boolean;
}
class DOMBool implements SBool {
    protected _input: HTMLInputElement;
    private _container: HTMLDivElement;
    private _tooltip: HTMLDivElement;
    private _required: HTMLSpanElement;
    private _restart: HTMLSpanElement;
    type: string = "bool";
    private _advanced: boolean;
    protected _section: string;
    protected _name: string;
    
    hide = () => {
		this._input.parentElement.classList.add("unfocused");
        const event = new CustomEvent(`settings-${this._section}-${this._name}`, { "detail": false })
        document.dispatchEvent(event);
	};
    show = () => {
		this._input.parentElement.classList.remove("unfocused");
        const event = new CustomEvent(`settings-${this._section}-${this._name}`, { "detail": this.valueAsString() })
        document.dispatchEvent(event);
	};

    private _advancedListener = (event: settingsBoolEvent) => {
        if (!Boolean(event.detail)) {
            this.hide();
        } else {
            this.show();
        }
    }

    get advanced(): boolean { return this._advanced; }
    set advanced(advanced: boolean) {
        this._advanced = advanced;
        if (advanced) {
            document.addEventListener("settings-advancedState", this._advancedListener);
        } else {
            document.removeEventListener("settings-advancedState", this._advancedListener);
        }
    }

    get name(): string { return this._container.querySelector("span.setting-label").textContent; }
    set name(n: string) { this._container.querySelector("span.setting-label").textContent = n; }

    get description(): string { return this._tooltip.querySelector("span.content").textContent; } 
    set description(d: string) {
        const content = this._tooltip.querySelector("span.content") as HTMLSpanElement;
        content.textContent = d;
        if (d == "") {
            this._tooltip.classList.add("unfocused");
        } else {
            this._tooltip.classList.remove("unfocused");
        }
    }

    get required(): boolean { return this._required.classList.contains("badge"); }
    set required(state: boolean) {
        if (state) {
            this._required.classList.add("badge", "~critical");
            this._required.textContent = "*";
        } else {
            this._required.classList.remove("badge", "~critical");
            this._required.textContent = "";
        }
    }
    
    get requires_restart(): boolean { return this._restart.classList.contains("badge"); }
    set requires_restart(state: boolean) {
        if (state) {
            this._restart.classList.add("badge", "~info", "dark:~d_warning");
            this._restart.textContent = "R";
        } else {
            this._restart.classList.remove("badge", "~info", "dark:~d_warning");
            this._restart.textContent = "";
        }
    }

    valueAsString = (): string => { return ""+this.value; };

    get value(): boolean { return this._input.checked; }
    set value(state: boolean) { this._input.checked = state; }
    
    constructor(setting: SBool, section: string, name: string) {
        this._section = section;
        this._name = name;
        this._container = document.createElement("div");
        this._container.classList.add("setting");
        this._container.setAttribute("data-name", name)
        this._container.innerHTML = `
        <label class="switch mb-2">
            <input type="checkbox">
            <span class="setting-label"></span> <span class="setting-required"></span> <span class="setting-restart"></span>
            <div class="setting-tooltip tooltip right unfocused">
                <i class="icon ri-information-line"></i>
                <span class="content sm"></span>
            </div>
        </label>
        `;
        this._tooltip = this._container.querySelector("div.setting-tooltip") as HTMLDivElement;
        this._required = this._container.querySelector("span.setting-required") as HTMLSpanElement;
        this._restart = this._container.querySelector("span.setting-restart") as HTMLSpanElement;
        this._input = this._container.querySelector("input[type=checkbox]") as HTMLInputElement;
        const onValueChange = () => {
            const event = new CustomEvent(`settings-${section}-${name}`, { "detail": this.valueAsString() })
            const setEvent = new CustomEvent(`settings-set-${section}-${name}`, { "detail": this.valueAsString() })
            document.dispatchEvent(event);
            document.dispatchEvent(setEvent);
        };
        this._input.onchange = () => { 
            onValueChange();
            if (this.requires_restart) { document.dispatchEvent(new CustomEvent("settings-requires-restart")); }
        };
        document.addEventListener(`settings-loaded`, onValueChange);

        if (setting.depends_false || setting.depends_true) {
            let dependant = splitDependant(section, setting.depends_true || setting.depends_false);
            let state = true;
            if (setting.depends_false) { state = false; }
            console.log(`I, ${section}-${name}, am adding a listener for ${dependant[0]}-${dependant[1]}`);
            document.addEventListener(`settings-${dependant[0]}-${dependant[1]}`, (event: settingsBoolEvent) => {
                console.log(`I, ${section}-${name}, was triggered by a listener for ${dependant[0]}-${dependant[1]}`);
                if (Boolean(event.detail) !== state) {
                    this.hide();
                } else {
                    this.show();
                }
            });
        }
        this.update(setting);
    }
    update = (s: SBool) => {
        this.name = s.name;
        this.description = s.description;
        this.required = s.required;
        this.requires_restart = s.requires_restart;
        this.value = s.value;
        this.advanced = s.advanced;
    }
    
    asElement = (): HTMLDivElement => { return this._container; }
}

interface SSelect extends Setting {
    options: string[][];
    value: string;
}
class DOMSelect implements SSelect {
    protected _select: HTMLSelectElement;
    private _container: HTMLDivElement;
    private _tooltip: HTMLDivElement;
    private _required: HTMLSpanElement;
    private _restart: HTMLSpanElement;
    private _options: string[][];
    type: string = "bool";
    private _advanced: boolean;
    protected _section: string;
    protected _name: string;

    hide = () => {
		this._container.classList.add("unfocused");
        const event = new CustomEvent(`settings-${this._section}-${this._name}`, { "detail": false })
        document.dispatchEvent(event);
	};
    show = () => {
		this._container.classList.remove("unfocused");
        const event = new CustomEvent(`settings-${this._section}-${this._name}`, { "detail": this.valueAsString() })
        document.dispatchEvent(event);
	};

    private _advancedListener = (event: settingsBoolEvent) => {
        if (!Boolean(event.detail)) {
            this.hide();
        } else {
            this.show();
        }
    }

    get advanced(): boolean { return this._advanced; }
    set advanced(advanced: boolean) {
        this._advanced = advanced;
        if (advanced) {
            document.addEventListener("settings-advancedState", this._advancedListener);
        } else {
            document.removeEventListener("settings-advancedState", this._advancedListener);
        }
    }

    get name(): string { return this._container.querySelector("span.setting-label").textContent; }
    set name(n: string) { this._container.querySelector("span.setting-label").textContent = n; }

    get description(): string { return this._tooltip.querySelector("span.content").textContent; } 
    set description(d: string) {
        const content = this._tooltip.querySelector("span.content") as HTMLSpanElement;
        content.textContent = d;
        if (d == "") {
            this._tooltip.classList.add("unfocused");
        } else {
            this._tooltip.classList.remove("unfocused");
        }
    }

    get required(): boolean { return this._required.classList.contains("badge"); }
    set required(state: boolean) {
        if (state) {
            this._required.classList.add("badge", "~critical");
            this._required.textContent = "*";
        } else {
            this._required.classList.remove("badge", "~critical");
            this._required.textContent = "";
        }
    }
    
    get requires_restart(): boolean { return this._restart.classList.contains("badge"); }
    set requires_restart(state: boolean) {
        if (state) {
            this._restart.classList.add("badge", "~info", "dark:~d_warning");
            this._restart.textContent = "R";
        } else {
            this._restart.classList.remove("badge", "~info", "dark:~d_warning");
            this._restart.textContent = "";
        }
    }

    valueAsString = (): string => { return ""+this.value; };

    get value(): string { return this._select.value; }
    set value(v: string) { this._select.value = v; }

    get options(): string[][] { return this._options; }
    set options(opt: string[][]) {
        this._options = opt;
        let innerHTML = "";
        for (let option of this._options) {
            innerHTML += `<option value="${option[0]}">${option[1]}</option>`;
        }
        this._select.innerHTML = innerHTML;
    }

    constructor(setting: SSelect, section: string, name: string) {
        this._section = section;
        this._name = name;
        this._options = [];
        this._container = document.createElement("div");
        this._container.classList.add("setting");
        this._container.setAttribute("data-name", name)
        this._container.innerHTML = `
        <label class="label">
            <span class="setting-label"></span> <span class="setting-required"></span> <span class="setting-restart"></span>
            <div class="setting-tooltip tooltip right unfocused">
                <i class="icon ri-information-line"></i>
                <span class="content sm"></span>
            </div>
            <div class="select ~neutral @low mt-2 mb-2">
                <select class="settings-select"></select>
            </div>
        </label>
        `;
        this._tooltip = this._container.querySelector("div.setting-tooltip") as HTMLDivElement;
        this._required = this._container.querySelector("span.setting-required") as HTMLSpanElement;
        this._restart = this._container.querySelector("span.setting-restart") as HTMLSpanElement;
        this._select = this._container.querySelector("select.settings-select") as HTMLSelectElement;
        if (setting.depends_false || setting.depends_true) {
            let dependant = splitDependant(section, setting.depends_true || setting.depends_false);
            let state = true;
            if (setting.depends_false) { state = false; }
            document.addEventListener(`settings-${dependant[0]}-${dependant[1]}`, (event: settingsBoolEvent) => {
                if (Boolean(event.detail) !== state) {
                    this.hide();
                } else {
                    this.show();
                }
            });
        }
        const onValueChange = () => {
            const event = new CustomEvent(`settings-${section}-${name}`, { "detail": this.valueAsString() });
            const setEvent = new CustomEvent(`settings-${section}-${name}`, { "detail": this.valueAsString() });
            document.dispatchEvent(event);
            document.dispatchEvent(setEvent);
            if (this.requires_restart) { document.dispatchEvent(new CustomEvent("settings-requires-restart")); }
        };
        this._select.onchange = onValueChange;
        document.addEventListener(`settings-loaded`, onValueChange);

        const message = document.getElementById("settings-message") as HTMLElement;
        message.innerHTML = window.lang.var("strings",
                                            "settingsRequiredOrRestartMessage",
                                            `<span class="badge ~critical">*</span>`,
                                            `<span class="badge ~info dark:~d_warning">R</span>`
        );

        this.update(setting);
    }
    update = (s: SSelect) => {
        this.name = s.name;
        this.description = s.description;
        this.required = s.required;
        this.requires_restart = s.requires_restart;
        this.options = s.options;
        this.value = s.value;
    }

    asElement = (): HTMLDivElement => { return this._container; }
}

interface SNote extends Setting {
    value: string;
    style?: string;
}
class DOMNote implements SNote {
    private _container: HTMLDivElement;
    private _aside: HTMLElement;
    private _name: HTMLElement;
    private _description: HTMLElement;
    type: string = "note";
    private _style: string;

    hide = () => {
		this._container.classList.add("unfocused");
        // We're a note, no one depends on us so we don't need to broadcast a state change.
	};
    show = () => {
		this._container.classList.remove("unfocused");
        // We're a note, no one depends on us so we don't need to broadcast a state change.
	};

    get name(): string { return this._name.textContent; }
    set name(n: string) { this._name.textContent = n; }

    get description(): string { return this._description.textContent; }
    set description(d: string) {
        this._description.innerHTML = d;
    }

    valueAsString = (): string => { return ""; };

    get value(): string { return ""; }
    set value(v: string) { return; }
    
    get required(): boolean { return false; }
    set required(v: boolean) { return; }
    
    get requires_restart(): boolean { return false; }
    set requires_restart(v: boolean) { return; }

    get style(): string { return this._style; }
    set style(s: string) {
        this._aside.classList.remove("~" + this._style);
        this._style = s;
        this._aside.classList.add("~" + this._style);
    }
    
    constructor(setting: SNote, section: string) {
        this._container = document.createElement("div");
        this._container.classList.add("setting");
        this._container.innerHTML = `
        <aside class="aside my-2">
            <span class="font-bold setting-name"></span>
            <span class="content setting-description">
        </aside>
        `;
        this._name = this._container.querySelector(".setting-name");
        this._description = this._container.querySelector(".setting-description");
        this._aside = this._container.querySelector("aside");

        if (setting.depends_false || setting.depends_true) {
            let dependant = splitDependant(section, setting.depends_true || setting.depends_false);
            let state = true;
            if (setting.depends_false) { state = false; }
            document.addEventListener(`settings-${dependant[0]}-${dependant[1]}`, (event: settingsBoolEvent) => {
                if (Boolean(event.detail) !== state) {
                    this.hide();
                } else {
                    this.show();
                }
            });
        }

        this.update(setting);
    }

    update = (s: SNote) => {
        this.name = s.name;
        this.description = s.description;
        this.style = ("style" in s && s.style) ? s.style : "info";
    };
    
    asElement = (): HTMLDivElement => { return this._container; }
}

interface Section {
    meta: Meta;
    order: string[];
    settings: { [settingName: string]: Setting };
}

class sectionPanel {
    private _section: HTMLDivElement;
    private _settings: { [name: string]: Setting };
    private _sectionName: string;
    values: { [field: string]: string } = {};

    constructor(s: Section, sectionName: string) {
        this._sectionName = sectionName;
        this._settings = {};
        this._section = document.createElement("div") as HTMLDivElement;
        this._section.classList.add("settings-section", "unfocused");
        this._section.setAttribute("data-section", sectionName);
        let innerHTML = `
        <div class="flex flex-row justify-between">
            <span class="heading">${s.meta.name}</span>
        `;
        if (s.meta.wiki_link) {
            innerHTML += `<a class="button ~urge dark:~d_info @low justify-center" target="_blank" href="${s.meta.wiki_link}" title="${window.lang.strings("wiki")}"><i class="ri-book-shelf-line"></i></a>`;
        }

        innerHTML += `
        </div>
        <p class="support lg my-2 settings-section-description">${s.meta.description}</p>
        `;
        this._section.innerHTML = innerHTML;

        this.update(s);
    }
    update = (s: Section) => {
        for (let name of s.order) {
            let setting: Setting = s.settings[name];
            if (name in this._settings) {
                this._settings[name].update(setting);
            } else {
                if (setting.deprecated) continue;
                switch (setting.type) {
                    case "text":
                        setting = new DOMText(setting, this._sectionName, name);
                        break;
                    case "password":
                        setting = new DOMPassword(setting, this._sectionName, name);
                        break;
                    case "email":
                        setting = new DOMEmail(setting, this._sectionName, name);
                        break;
                    case "number":
                        setting = new DOMNumber(setting, this._sectionName, name);
                        break;
                    case "bool":
                        setting = new DOMBool(setting as SBool, this._sectionName, name);
                        break;
                    case "select":
                        setting = new DOMSelect(setting as SSelect, this._sectionName, name);
                        break;
                    case "note":
                        setting = new DOMNote(setting as SNote, this._sectionName);
                        break;
                    case "list":
                        setting = new DOMList(setting as SList, this._sectionName, name);
                        break;
                }
                if (setting.type != "note") {
                    this.values[name] = ""+setting.value;
                    // settings-section-name: Implies the setting changed or was shown/hidden.
                    // settings-set-section-name: Implies the setting changed.
                    document.addEventListener(`settings-set-${this._sectionName}-${name}`, (event: CustomEvent) => {
                        // const oldValue = this.values[name];
                        this.values[name] = event.detail;
                        document.dispatchEvent(new CustomEvent("settings-section-changed"));
                    });
                }
                this._section.appendChild(setting.asElement());
                this._settings[name] = setting;
            }
        }
    }
    
    get visible(): boolean { return !this._section.classList.contains("unfocused"); }
    set visible(s: boolean) {
        if (s) {
            this._section.classList.remove("unfocused");
        } else {
            this._section.classList.add("unfocused");
        }
    }

    asElement = (): HTMLDivElement => { return this._section; }
}

interface Settings {
    order: string[];
    sections: { [sectionName: string]: Section };
}

export class settingsList {
    private _saveButton = document.getElementById("settings-save") as HTMLSpanElement;
    private _saveNoRestart = document.getElementById("settings-apply-no-restart") as HTMLSpanElement;
    private _saveRestart = document.getElementById("settings-apply-restart") as HTMLSpanElement;

    private _loader = document.getElementById("settings-loader") as HTMLDivElement;
    
    private _panel = document.getElementById("settings-panel") as HTMLDivElement;
    private _sidebar = document.getElementById("settings-sidebar") as HTMLDivElement;
    private _visibleSection: string;
    private _sections: { [name: string]: sectionPanel }
    private _buttons: { [name: string]: HTMLSpanElement }
    private _needsRestart: boolean = false;
    private _messageEditor = new MessageEditor();
    private _settings: Settings;
    private _advanced: boolean = false;

    private _searchbox: HTMLInputElement = document.getElementById("settings-search") as HTMLInputElement;
    private _clearSearchboxButtons: Array<HTMLButtonElement> = Array.from(document.getElementsByClassName("settings-search-clear")) as Array<HTMLButtonElement>;

    private _noResultsPanel: HTMLElement = document.getElementById("settings-not-found");

    private _backupSortDirection = document.getElementById("settings-backups-sort-direction") as HTMLButtonElement;
    private _backupSortAscending = true;

    addSection = (name: string, s: Section, subButton?: HTMLElement) => {
        const section = new sectionPanel(s, name);
        this._sections[name] = section;
        this._panel.appendChild(this._sections[name].asElement());
        const button = document.createElement("span") as HTMLSpanElement;
        button.classList.add("button", "~neutral", "@low", "settings-section-button", "justify-between");
        button.textContent = s.meta.name;
        if (subButton) { button.appendChild(subButton); }
        button.onclick = () => { this._showPanel(name); };
        if (s.meta.depends_true || s.meta.depends_false) {
            let dependant = splitDependant(name, s.meta.depends_true || s.meta.depends_false);
            let state = true;
            if (s.meta.depends_false) { state = false; }
            document.addEventListener(`settings-${dependant[0]}-${dependant[1]}`, (event: settingsBoolEvent) => {

                if (Boolean(event.detail) !== state) {
                    button.classList.add("unfocused");
                    document.dispatchEvent(new CustomEvent(`settings-${name}`, { detail: false }));
                } else {
                    button.classList.remove("unfocused");
                    document.dispatchEvent(new CustomEvent(`settings-${name}`, { detail: true }));
                }
            });
            document.addEventListener(`settings-${dependant[0]}`, (event: settingsBoolEvent) => {
                if (Boolean(event.detail) !== state) {
                    button.classList.add("unfocused");
                    document.dispatchEvent(new CustomEvent(`settings-${name}`, { detail: false }));
                }
            }); 
        }
        if (s.meta.advanced) {
            document.addEventListener("settings-advancedState", (event: settingsBoolEvent) => {
                if (!Boolean(event.detail)) {
                    button.classList.add("unfocused");
                } else {
                    button.classList.remove("unfocused");
                }
                this._searchbox.oninput(null);
            });
        }
        this._buttons[name] = button;
        this._sidebar.appendChild(this._buttons[name]);
    }

    private _showPanel = (name: string) => {
        for (let n in this._sections) {
            if (n == name) {
                this._sections[name].visible = true;
                this._visibleSection = name;
                this._buttons[name].classList.add("selected");
            } else {
                this._sections[n].visible = false;
                this._buttons[n].classList.remove("selected");
            }
        }
    }

    private _save = () => {
        let config = {};
        for (let name in this._sections) {
            config[name] = this._sections[name].values;
        }
        if (this._needsRestart) { 
            this._saveRestart.onclick = () => {
                config["restart-program"] = true;
                this._send(config, () => {
                    window.modals.settingsRestart.close(); 
                    window.modals.settingsRefresh.show();
                });
            };
            this._saveNoRestart.onclick = () => {
                config["restart-program"] = false;
                this._send(config, window.modals.settingsRestart.close); 
            }
            window.modals.settingsRestart.show(); 
        } else {
            this._send(config);
        }
        // console.log(config);
    }

    private _send = (config: Object, run?: () => void) => _post("/config", config, (req: XMLHttpRequest) => {
        if (req.readyState == 4) {
            if (req.status == 200 || req.status == 204) {
                window.notifications.customSuccess("settingsSaved", window.lang.notif("saveSettings"));
            } else {
                window.notifications.customError("settingsSaved", window.lang.notif("errorSaveSettings"));
            }
            this.reload();
            if (run) { run(); }
        }
    });

    private _showLogs = () => _get("/logs", null, (req: XMLHttpRequest) => {
        if (req.readyState == 4 && req.status == 200) {
            (document.getElementById("log-area") as HTMLPreElement).textContent = req.response["log"] as string;
            window.modals.logs.show();
        }
    });

    setBackupSort = (ascending: boolean) => {
        this._backupSortAscending = ascending;
        this._backupSortDirection.innerHTML = `${window.lang.strings("sortDirection")} <i class="ri-arrow-${ascending ? "up" : "down"}-s-line ml-2"></i>`;
        this._getBackups();
    };

    private _backup = () => _post("/backups", null, (req: XMLHttpRequest) => {
        if (req.readyState != 4 || req.status != 200) return;
        const backupDTO = req.response as BackupDTO;
        if (backupDTO.path == "") {
            window.notifications.customError("backupError", window.lang.strings("errorFailureCheckLogs"));
            return;
        }
        const location = document.getElementById("settings-backed-up-location");
        const download = document.getElementById("settings-backed-up-download");
        location.innerHTML = window.lang.strings("backupCanBeFound").replace("{filepath}", `<span class="text-black dark:text-white font-mono bg-inherit">"`+backupDTO.path+`"</span>`);
        download.innerHTML = `
        <i class="ri-download-line"></i>
        <span class="ml-2">${window.lang.strings("download")}</span>
        <span class="badge ~info @low ml-2">${backupDTO.size}</span>
        `;
        
        download.parentElement.onclick = () => _download("/backups/" + backupDTO.name, backupDTO.name);
        window.modals.backedUp.show();
    }, true);

    private _getBackups = () => _get("/backups", null, (req: XMLHttpRequest) => {
        if (req.readyState != 4 || req.status != 200) return;
        const backups = req.response["backups"] as BackupDTO[];
        const table = document.getElementById("backups-list");
        table.textContent = ``;
        if (!this._backupSortAscending) {
            backups.reverse();
        }
        for (let b of backups) {
            const tr = document.createElement("tr") as HTMLTableRowElement;
            tr.innerHTML = `
            <td class="whitespace-nowrap"><span class="text-black dark:text-white font-mono bg-inherit">${b.name}</span> <span class="button ~info @low ml-2 backup-copy" title="${window.lang.strings("copy")}"><i class="ri-file-copy-line"></i></span></td>
            <td>${toDateString(new Date(b.date*1000))}</td>
            <td class="table-inline justify-center">
                <span class="backup-download button ~positive @low" title="${window.lang.strings("backupDownload")}">
                    <i class="ri-download-line"></i>
                    <span class="badge ~positive @low ml-2">${b.size}</span>
                </span>
                <span class="backup-restore button ~critical @low ml-2 py-[inherit]" title="${window.lang.strings("backupRestore")}"><i class="icon ri-restart-line"></i></span>
            </td>
            `;
            tr.querySelector(".backup-copy").addEventListener("click", () => {
                toClipboard(b.path);
                window.notifications.customPositive("pathCopied", "", window.lang.notif("pathCopied"));
            });
            tr.querySelector(".backup-download").addEventListener("click", () => _download("/backups/" + b.name, b.name));
            tr.querySelector(".backup-restore").addEventListener("click", () => {
                _post("/backups/restore/"+b.name, null, () => {});
                window.modals.backups.close();
                window.modals.settingsRefresh.modal.querySelector("span.heading").textContent = window.lang.strings("settingsRestarting");
                window.modals.settingsRefresh.show();
            });
            table.appendChild(tr);
        }
    });

    constructor() {
        this._sections = {};
        this._buttons = {};
        document.addEventListener("settings-section-changed", () => this._saveButton.classList.remove("unfocused"));
        document.getElementById("settings-restart").onclick = () => {
            _post("/restart", null, () => {});
            window.modals.settingsRefresh.modal.querySelector("span.heading").textContent = window.lang.strings("settingsRestarting");
            window.modals.settingsRefresh.show();
        };
        this._saveButton.onclick = this._save;
        document.addEventListener("settings-requires-restart", () => { this._needsRestart = true; });
        document.getElementById("settings-logs").onclick = this._showLogs;
        document.getElementById("settings-backups-backup").onclick = () => {
            window.modals.backups.close();
            this._backup();
        };

        document.getElementById("settings-backups").onclick = () => {
            this.setBackupSort(this._backupSortAscending);
            window.modals.backups.show();
        };
        this._backupSortDirection.onclick = () => this.setBackupSort(!(this._backupSortAscending));
        const advancedEnableToggle = document.getElementById("settings-advanced-enabled") as HTMLInputElement;

        const filedlg = document.getElementById("backups-file") as HTMLInputElement;
        document.getElementById("settings-backups-upload").onclick = () => {
            filedlg.click(); 
        };
        filedlg.addEventListener("change", () => {
            if (filedlg.files.length == 0) return;
            const form = new FormData();
            form.append("backups-file", filedlg.files[0], filedlg.files[0].name);
            _upload("/backups/restore", form);
            window.modals.backups.close();
            window.modals.settingsRefresh.modal.querySelector("span.heading").textContent = window.lang.strings("settingsRestarting");
            window.modals.settingsRefresh.show();
        });

        advancedEnableToggle.onchange = () => {
            document.dispatchEvent(new CustomEvent("settings-advancedState", { detail: advancedEnableToggle.checked }));
            const parent = advancedEnableToggle.parentElement;
            this._advanced = advancedEnableToggle.checked;
            if (this._advanced) {
                parent.classList.add("~urge");
                parent.classList.remove("~neutral");
            } else {
                parent.classList.add("~neutral");
                parent.classList.remove("~urge");
            }
            this._searchbox.oninput(null);
        };
        advancedEnableToggle.checked = false;

        this._searchbox.oninput = () => {
            this.search(this._searchbox.value);
        };
        for (let b of this._clearSearchboxButtons) {
            b.onclick = () => {
                this._searchbox.value = "";
                this._searchbox.oninput(null);
            };
        };
    }

    private _addMatrix = () => {
        // Modify the login modal, why not
        const modal = document.getElementById("form-matrix") as HTMLFormElement;
        modal.onsubmit = (event: Event) => {
            event.preventDefault();
            const button = modal.querySelector("span.submit") as HTMLSpanElement;
            addLoader(button);
            let send = {
                homeserver: (document.getElementById("matrix-homeserver") as HTMLInputElement).value,
                username: (document.getElementById("matrix-user") as HTMLInputElement).value,
                password: (document.getElementById("matrix-password") as HTMLInputElement).value
            }
            _post("/matrix/login", send, (req: XMLHttpRequest) => {
                if (req.readyState == 4) {
                    removeLoader(button);
                    if (req.status == 400) {
                        window.notifications.customError("errorUnknown", window.lang.notif(req.response["error"] as string));
                        return;
                    } else if (req.status == 401) {
                        window.notifications.customError("errorUnauthorized", req.response["error"] as string);
                        return;
                    } else if (req.status == 500) {
                        window.notifications.customError("errorAddMatrix", window.lang.notif("errorFailureCheckLogs"));
                        return;
                    }
                    window.modals.matrix.close();
                    _post("/restart", null, () => {});
                    window.location.reload();
                }
            }, true);
        };
        window.modals.matrix.show();
    }

    reload = () => {
        for (let i = 0; i < this._loader.children.length; i++) {
            this._loader.children[i].classList.add("invisible");
        }
        addLoader(this._loader, false, true);
        _get("/config", null, (req: XMLHttpRequest) => {
            if (req.readyState == 4) {
                if (req.status != 200) {
                    window.notifications.customError("settingsLoadError", window.lang.notif("errorLoadSettings"));
                    return;
                }
                this._settings = req.response as Settings;
                for (let name of this._settings.order) {
                    if (name in this._sections) {
                        this._sections[name].update(this._settings.sections[name]);
                    } else {
                        if (name == "messages" || name == "user_page") {
                            const editButton = document.createElement("div");
                            editButton.classList.add("tooltip", "left");
                            editButton.innerHTML = `
                            <span class="button ~neutral @low">
                                <i class="icon ri-edit-line"></i>
                            </span>
                            <span class="content sm">
                            ${window.lang.get("strings", "customizeMessages")}
                            </span>
                            `;
                            (editButton.querySelector("span.button") as HTMLSpanElement).onclick = () => {
                                this._messageEditor.showList(name == "messages" ? "email" : "user");
                            };
                            this.addSection(name, this._settings.sections[name], editButton);
                        } else if (name == "updates") {
                            const icon = document.createElement("span") as HTMLSpanElement;
                            if (window.updater.updateAvailable) {
                                icon.classList.add("button", "~urge");
                                icon.innerHTML = `<i class="ri-download-line" title="${window.lang.strings("update")}"></i>`;
                                icon.onclick = () => window.updater.checkForUpdates(window.modals.updateInfo.show);
                            }
                            this.addSection(name, this._settings.sections[name], icon);
                        } else if (name == "matrix" && !window.matrixEnabled) {
                            const addButton = document.createElement("div");
                            addButton.classList.add("tooltip", "left");
                            addButton.innerHTML = `
                            <span class="button ~neutral @low">+</span>
                            <span class="content sm">
                            ${window.lang.strings("linkMatrix")}
                            </span>
                            `;
                            (addButton.querySelector("span.button") as HTMLSpanElement).onclick = this._addMatrix;
                            this.addSection(name, this._settings.sections[name], addButton);
                        } else {
                            this.addSection(name, this._settings.sections[name]);
                        }
                    }
                }
                removeLoader(this._loader);
                for (let i = 0; i < this._loader.children.length; i++) {
                    this._loader.children[i].classList.remove("invisible");
                }
                this._showPanel(this._settings.order[0]);
                document.dispatchEvent(new CustomEvent("settings-loaded"));
                document.dispatchEvent(new CustomEvent("settings-advancedState", { detail: false }));
                this._saveButton.classList.add("unfocused");
                this._needsRestart = false;
            }
        })
    };

    // FIXME: Search "About" & "User profiles", pseudo-search "User profiles" for things like "Ombi", "Referrals", etc.
    search = (query: string) => {
        query = query.toLowerCase().trim();
        // Make sure a blank search is detected when there's just whitespace.
        if (query.replace(/\s+/g, "") == "") query = "";

        let firstVisibleSection = "";
        for (let section of this._settings.order) {

            let dependencyCard = this._sections[section].asElement().querySelector(".settings-dependency-message");
            if (dependencyCard) dependencyCard.remove();
            dependencyCard = null;
            let dependencyList = null;

            // hide button, unhide if matched
            this._buttons[section].classList.add("unfocused");

            let matchedSection = false;

            if (section.toLowerCase().includes(query) ||
                this._settings.sections[section].meta.name.toLowerCase().includes(query) ||
                this._settings.sections[section].meta.description.toLowerCase().includes(query)) {
                if ((this._settings.sections[section].meta.advanced && this._advanced) || !(this._settings.sections[section].meta.advanced)) {
                    this._buttons[section].classList.remove("unfocused");
                    firstVisibleSection = firstVisibleSection || section;
                    matchedSection = true;
                }
            }
            const sectionElement = this._sections[section].asElement();
            for (let setting of this._settings.sections[section].order) {
                if (this._settings.sections[section].settings[setting].type == "note") continue;
                const element = sectionElement.querySelector(`div[data-name="${setting}"]`) as HTMLElement;

                // If we match the whole section, don't bother searching settings.
                if (matchedSection) {
                    element.classList.remove("opacity-50", "pointer-events-none");
                    element.setAttribute("aria-disabled", "false");
                    continue;
                }

                // element.classList.remove("-mx-2", "my-2", "p-2", "aside", "~neutral", "@low");
                element.classList.add("opacity-50", "pointer-events-none");
                element.setAttribute("aria-disabled", "true");
                if (setting.toLowerCase().includes(query) ||
                    this._settings.sections[section].settings[setting].name.toLowerCase().includes(query) ||
                    this._settings.sections[section].settings[setting].description.toLowerCase().includes(query) ||
                    String(this._settings.sections[section].settings[setting].value).toLowerCase().includes(query)) {
                    if ((this._settings.sections[section].meta.advanced && this._advanced) || !(this._settings.sections[section].meta.advanced)) {
                        this._buttons[section].classList.remove("unfocused");
                        firstVisibleSection = firstVisibleSection || section;
                    }
                    const shouldShow = (query != "" &&
                                    ((this._settings.sections[section].settings[setting].advanced && this._advanced) ||
                                    !(this._settings.sections[section].settings[setting].advanced)));
                    if (shouldShow || query == "") {
                        // element.classList.add("-mx-2", "my-2", "p-2", "aside", "~neutral", "@low");
                        element.classList.remove("opacity-50", "pointer-events-none");
                        element.setAttribute("aria-disabled", "false");
                    }
                    if (query != "" && ((shouldShow && element.querySelector("label").classList.contains("unfocused")) || (!shouldShow))) {
                        // Add a note explaining why the setting is hidden
                        if (!dependencyCard) {
                            dependencyCard = document.createElement("aside");
                            dependencyCard.classList.add("aside", "my-2", "~warning", "settings-dependency-message");
                            dependencyCard.innerHTML = `
                            <div class="content text-sm">
                                <span class="font-bold">${window.lang.strings("settingsHiddenDependency")}</span>
                        
                                <ul class="settings-dependency-list"></ul>
                            </div>
                            `;
                            dependencyList = dependencyCard.querySelector(".settings-dependency-list") as HTMLUListElement;
                            // Insert it right after the description
                            this._sections[section].asElement().insertBefore(dependencyCard, this._sections[section].asElement().querySelector(".settings-section-description").nextElementSibling);
                        }
                        const li = document.createElement("li");
                        if (shouldShow) {
                            const depCode = this._settings.sections[section].settings[setting].depends_true || this._settings.sections[section].settings[setting].depends_false;
                            const dep = splitDependant(section, depCode);

                            let depName = this._settings.sections[dep[0]].settings[dep[1]].name;
                            if (dep[0] != section) {
                                depName = this._settings.sections[dep[0]].meta.name + " > " + depName;
                            }

                            li.textContent = window.lang.strings("settingsDependsOn").replace("{setting}", `"`+this._settings.sections[section].settings[setting].name+`"`).replace("{dependency}", `"`+depName+`"`);
                        } else {
                            li.textContent = window.lang.strings("settingsAdvancedMode").replace("{setting}", `"`+this._settings.sections[section].settings[setting].name+`"`);
                        }
                        dependencyList.appendChild(li);
                    }
                }
            }
        }
        if (firstVisibleSection && (query != "" || this._visibleSection == "")) {
            this._buttons[firstVisibleSection].onclick(null);
            this._noResultsPanel.classList.add("unfocused");
        } else if (query != "") {
            this._noResultsPanel.classList.remove("unfocused");
            if (this._visibleSection) {
                this._sections[this._visibleSection].visible = false;
                this._buttons[this._visibleSection].classList.remove("selected");
                this._visibleSection = "";
            }
        }
    }
}

export interface templateEmail {
    content: string;
    variables: string[];
    conditionals: string[];
    values: { [key: string]: string };
    html: string;
    plaintext: string;
}

interface emailListEl {
    name: string;
    enabled: boolean;
    description: string;
}

class MessageEditor {
    private _currentID: string;
    private _names: { [id: string]: emailListEl };
    private _content: string;
    private _templ: templateEmail;
    private _form = document.getElementById("form-editor") as HTMLFormElement;
    private _header = document.getElementById("header-editor") as HTMLSpanElement;
    private _aside = document.getElementById("aside-editor") as HTMLElement;
    private _variables = document.getElementById("editor-variables") as HTMLDivElement;
    private _variablesLabel = document.getElementById("label-editor-variables") as HTMLElement;
    private _conditionals = document.getElementById("editor-conditionals") as HTMLDivElement;
    private _conditionalsLabel = document.getElementById("label-editor-conditionals") as HTMLElement;
    private _textArea = document.getElementById("textarea-editor") as HTMLTextAreaElement;
    private _preview = document.getElementById("editor-preview") as HTMLDivElement;
    private _previewContent: HTMLElement;
    // private _timeout: number;
    // private _finishInterval = 200;

    loadEditor = (id: string) => {
        this._currentID = id;
        _get("/config/emails/" + id, null, (req: XMLHttpRequest) => {
            if (req.readyState == 4) {
                if (req.status != 200) {
                    window.notifications.customError("loadTemplateError", window.lang.notif("errorFailureCheckLogs"));
                    return;
                }
                if (this._names[id] !== undefined) {
                    this._header.textContent = this._names[id].name;
                } 
                this._aside.classList.add("unfocused");
                if (this._names[id].description != "") {
                    this._aside.textContent = this._names[id].description;
                    this._aside.classList.remove("unfocused");
                }

                this._templ = req.response as templateEmail;
                this._textArea.value = this._templ.content;
                if (this._templ.html == "") {
                    this._preview.innerHTML = `<pre class="preview-content" class="font-mono bg-inherit"></pre>`;
                } else {
                    this._preview.innerHTML = this._templ.html;
                }
                this._previewContent = this._preview.getElementsByClassName("preview-content")[0] as HTMLElement;
                this.loadPreview();
                this._content = this._templ.content;
                const colors = ["info", "urge", "positive", "neutral"];
                let innerHTML = '';
                for (let i = 0; i < this._templ.variables.length; i++) {
                    let ci = i % colors.length;
                    innerHTML += '<span class="button ~' + colors[ci] +' @low mb-4" style="margin-left: 0.25rem; margin-right: 0.25rem;"></span>'
                }
                if (this._templ.variables.length == 0) {
                    this._variablesLabel.classList.add("unfocused");
                } else {
                    this._variablesLabel.classList.remove("unfocused");
                }
                this._variables.innerHTML = innerHTML
                let buttons = this._variables.querySelectorAll("span.button") as NodeListOf<HTMLSpanElement>;
                for (let i = 0; i < this._templ.variables.length; i++) {
                    buttons[i].innerHTML = `<span class="font-mono bg-inherit">` + this._templ.variables[i] + `</span>`;
                    buttons[i].onclick = () => {
                        insertText(this._textArea, this._templ.variables[i]);
                        this.loadPreview();
                        // this._timeout = setTimeout(this.loadPreview, this._finishInterval);
                    }
                }

                innerHTML = '';
                if (this._templ.conditionals == null || this._templ.conditionals.length == 0) {
                    this._conditionalsLabel.classList.add("unfocused");
                } else {
                    for (let i = this._templ.conditionals.length-1; i >= 0; i--) {
                        let ci = i % colors.length;
                        innerHTML += '<span class="button ~' + colors[ci] +' @low mb-4" style="margin-left: 0.25rem; margin-right: 0.25rem;"></span>'
                    }
                    this._conditionalsLabel.classList.remove("unfocused");
                    this._conditionals.innerHTML = innerHTML
                    buttons = this._conditionals.querySelectorAll("span.button") as NodeListOf<HTMLSpanElement>;
                    for (let i = 0; i < this._templ.conditionals.length; i++) {
                        buttons[i].innerHTML = `<span class="font-mono bg-inherit">{if ` + this._templ.conditionals[i].slice(1) + `</span>`;
                        buttons[i].onclick = () => {
                            insertText(this._textArea, "{if " + this._templ.conditionals[i].slice(1) + "{endif}");
                            this.loadPreview();
                            // this._timeout = setTimeout(this.loadPreview, this._finishInterval);
                        }
                    }
                }
                window.modals.editor.show();
            }
        })
    }
    loadPreview = () => {
        let content = this._textArea.value;
        if (this._templ.variables) {
            for (let variable of this._templ.variables) {
                let value = this._templ.values[variable.slice(1, -1)];
                if (value === undefined) { value = variable; }
                content = content.replace(new RegExp(variable, "g"), value);
            }
        }
        if (this._templ.html == "") {
            content = stripMarkdown(content);
            this._previewContent.textContent = content;
        } else {
            content = Marked.parse(content);
            this._previewContent.innerHTML = content;
        }
        // _post("/config/emails/" + this._currentID + "/test", { "content": this._textArea.value }, (req: XMLHttpRequest) => {
        //     if (req.readyState == 4) {
        //         if (req.status != 200) {
        //             window.notifications.customError("loadTemplateError", window.lang.notif("errorFailureCheckLogs"));
        //             return;
        //         }
        //         this._preview.innerHTML = (req.response as Email).html;
        //     }
        // }, true);
    }

    showList = (filter?: string) => {
        _get("/config/emails?lang=" + window.language + (filter ? "&filter=" + filter : ""), null, (req: XMLHttpRequest) => {
            if (req.readyState == 4) {
                if (req.status != 200) {
                    window.notifications.customError("loadTemplateError", window.lang.notif("errorFailureCheckLogs"));
                    return;
                }
                this._names = req.response;
                const list = document.getElementById("customize-list") as HTMLDivElement;
                list.textContent = '';
                for (let id in this._names) {
                    const tr = document.createElement("tr") as HTMLTableRowElement;
                    let resetButton = ``;
                    if (this._names[id].enabled) {
                        resetButton = `<i class="icon ri-restart-line" title="${window.lang.get("strings", "reset")}"></i>`;
                    }
                    let innerHTML = `
                    <td>
                        ${this._names[id].name}
                    `;
                    if (this._names[id].description != "") innerHTML += `
                        <div class="tooltip right">
                            <i class="icon ri-information-line"></i>
                            <span class="content sm">${this._names[id].description}</span>
                        </div>
                    `;
                    innerHTML += `
                    </td>
                    <td class="table-inline justify-center"><span class="customize-reset">${resetButton}</span></td>
                    <td><span class="button ~info @low" title="${window.lang.get("strings", "edit")}"><i class="icon ri-edit-line"></i></span></td>
                    `;
                    tr.innerHTML = innerHTML;
                    (tr.querySelector("span.button") as HTMLSpanElement).onclick = () => {
                        window.modals.customizeEmails.close()
                        this.loadEditor(id);
                    };
                    if (this._names[id].enabled) {
                        const rb = tr.querySelector("span.customize-reset") as HTMLElement;
                        rb.classList.add("button");
                        rb.onclick = () => _post("/config/emails/" + id + "/state/disable", null, (req: XMLHttpRequest) => {
                            if (req.readyState == 4) {
                                if (req.status != 200 && req.status != 204) {
                                    window.notifications.customError("setEmailStateError", window.lang.notif("errorFailureCheckLogs"));
                                    return;
                                }
                                rb.remove();
                            }
                        });
                    }
                    list.appendChild(tr);
                }
                window.modals.customizeEmails.show();
            }
        });
    }

    constructor() {
        this._textArea.onkeyup = () => {
            // clearTimeout(this._timeout);
            // this._timeout = setTimeout(this.loadPreview, this._finishInterval);
            this.loadPreview();
        };
        // this._textArea.onkeydown = () => {
        //     clearTimeout(this._timeout);
        // };

        this._form.onsubmit = (event: Event) => {
            event.preventDefault()
            if (this._textArea.value == this._content && this._names[this._currentID].enabled) {
                window.modals.editor.close();
                return;
            }
            _post("/config/emails/" + this._currentID, { "content": this._textArea.value }, (req: XMLHttpRequest) => {
                if (req.readyState == 4) {
                    window.modals.editor.close();
                    if (req.status != 200) {
                        window.notifications.customError("saveEmailError", window.lang.notif("errorSaveEmail"));
                        return;
                    }
                    window.notifications.customSuccess("saveEmail", window.lang.notif("saveEmail"));
                }
            });
        };
    }
}
