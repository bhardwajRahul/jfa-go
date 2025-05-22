const dateParser = require("any-date-parser");

declare var window: GlobalWindow;

export enum QueryOperator {
    Greater = ">",
    Lower = "<",
    Equal = "="
}

export function QueryOperatorToDateText(op: QueryOperator): string {
    switch (op) {
        case QueryOperator.Greater:
            return window.lang.strings("after");
        case QueryOperator.Lower:
            return window.lang.strings("before");
        default:
            return "";
    }
}

export interface QueryType {
    name: string;
    description?: string;
    getter: string;
    bool: boolean;
    string: boolean;
    date: boolean;
    dependsOnElement?: string; // Format for querySelector
    show?: boolean;
}

export interface SearchConfiguration {
    filterArea: HTMLElement;
    sortingByButton?: HTMLButtonElement;
    searchOptionsHeader: HTMLElement;
    notFoundPanel: HTMLElement;
    notFoundLocallyText: HTMLElement;
    notFoundCallback?: (notFound: boolean) => void;
    filterList: HTMLElement;
    clearSearchButtonSelector: string;
    serverSearchButtonSelector: string;
    search: HTMLInputElement;
    queries: { [field: string]: QueryType };
    setVisibility: (items: string[], visible: boolean) => void;
    onSearchCallback: (visibleCount: number, newItems: boolean, loadAll: boolean) => void;
    searchServer: (params: PaginatedReqDTO, newSearch: boolean) => void;
    clearServerSearch: () => void;
    loadMore?: () => void;
}

export interface ServerSearchReqDTO extends PaginatedReqDTO {
    searchTerms: string[];
    queries: QueryDTO[];
}

export interface QueryDTO {
    class: "bool" | "string" | "date";
    // QueryType.getter
    field: string;
    operator: QueryOperator;
    value: boolean | string | DateAttempt;
};

export abstract class Query {
    protected _subject: QueryType;
    protected _operator: QueryOperator;
    protected _card: HTMLElement;

    constructor(subject: QueryType | null, operator: QueryOperator) {
        this._subject = subject;
        this._operator = operator;
        if (subject != null) {
            this._card = document.createElement("span");
            this._card.ariaLabel = window.lang.strings("clickToRemoveFilter");
        }
    }

    set onclick(v: () => void) {
        this._card.addEventListener("click", v);
    }

    asElement(): HTMLElement { return this._card; }
    
    public abstract compare(subjectValue: any): boolean;

    asDTO(): QueryDTO {
        let out = {} as QueryDTO;
        out.field = this._subject.getter;
        out.operator = this._operator;
        return out;
    }

    get subject(): QueryType { return this._subject; }

    getValueFromItem(item: SearchableItem): any {
        return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(item), this.subject.getter).get.call(item);
    }

    compareItem(item: SearchableItem): boolean {
        return this.compare(this.getValueFromItem(item));
    }
}

export class BoolQuery extends Query {
    protected _value: boolean;
    constructor(subject: QueryType, value: boolean) {
        super(subject, QueryOperator.Equal);
        this._value = value;
        this._card.classList.add("button", "~" + (this._value ? "positive" : "critical"), "@high", "center", "mx-2", "h-full");
        this._card.innerHTML = `
        <span class="font-bold mr-2">${subject.name}</span>
        <i class="text-2xl ri-${this._value? "checkbox" : "close"}-circle-fill"></i>
        `;
    }

    public static paramsFromString(valueString: string): [boolean, boolean] {
        let isBool = false;
        let boolState = false;
        if (valueString == "true" || valueString == "yes" || valueString == "t" || valueString == "y") {
            isBool = true;
            boolState = true;
        } else if (valueString == "false" || valueString == "no" || valueString == "f" || valueString == "n") {
            isBool = true;
            boolState = false;
        }
        return [boolState, isBool]
    }

    get value(): boolean { return this._value; }

    // Ripped from old code. Why it's like this, I don't know
    public compare(subjectBool: boolean): boolean {
        return ((subjectBool && this._value) || (!subjectBool && !this._value))
    }

    asDTO(): QueryDTO {
        let out = super.asDTO();
        out.class = "bool";
        out.value = this._value;
        return out;
    }
}

export class StringQuery extends Query {
    protected _value: string;
    constructor(subject: QueryType, value: string) {
        super(subject, QueryOperator.Equal);
        this._value = value.toLowerCase();
        this._card.classList.add("button", "~neutral", "@low", "center", "mx-2", "h-full");
        this._card.innerHTML = `
        <span class="font-bold mr-2">${subject.name}:</span> "${this._value}"
        `;
    }

    get value(): string { return this._value; }

    public compare(subjectString: string): boolean {
        return subjectString.toLowerCase().includes(this._value);
    }
    
    asDTO(): QueryDTO {
        let out = super.asDTO();
        out.class = "string";
        out.value = this._value;
        return out;
    }
}

export interface DateAttempt {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number
}

export interface ParsedDate {
    attempt: DateAttempt;
    date: Date;
    text: string;
};
    
const dateGetters: Map<string, () => number> = (() => {
    let m = new Map<string, () => number>();
    m.set("year", Date.prototype.getFullYear);
    m.set("month", Date.prototype.getMonth);
    m.set("day", Date.prototype.getDate);
    m.set("hour", Date.prototype.getHours);
    m.set("minute", Date.prototype.getMinutes);
    return m;
})();
const dateSetters: Map<string, (v: number) => void> = (() => {
    let m = new Map<string, (v: number) => void>();
    m.set("year", Date.prototype.setFullYear);
    m.set("month", Date.prototype.setMonth);
    m.set("day", Date.prototype.setDate);
    m.set("hour", Date.prototype.setHours);
    m.set("minute", Date.prototype.setMinutes);
    return m;
})();

export class DateQuery extends Query {
    protected _value: ParsedDate;

    constructor(subject: QueryType, operator: QueryOperator, value: ParsedDate) {
        super(subject, operator);
        this._value = value;
        this._card.classList.add("button", "~neutral", "@low", "center", "m-2", "h-full");
        let dateText = QueryOperatorToDateText(operator);
        this._card.innerHTML = `
        <span class="font-bold mr-2">${subject.name}:</span> ${dateText != "" ? dateText+" " : ""}${value.text}
        `;
    }
    public static paramsFromString(valueString: string): [ParsedDate, QueryOperator, boolean] {
        // FIXME: Validate this!
        let op = QueryOperator.Equal;
        if ((Object.values(QueryOperator) as string[]).includes(valueString.charAt(0))) {
            op = valueString.charAt(0) as QueryOperator;
            // Trim the operator from the string
            valueString = valueString.substring(1);
        }

        let out: ParsedDate = {
            text: valueString,
            // Used just to tell use what fields the user passed.
            attempt: dateParser.attempt(valueString),
            // note Date.fromString is also provided by dateParser.
            date: (Date as any).fromString(valueString) as Date
        };
        // Month in Date objects is 0-based, so make our parsed date that way too
        if ("month" in out.attempt) out.attempt.month -= 1;
        let isValid = true;
        if ("invalid" in (out.date as any)) { isValid = false; };
        
        return [out, op, isValid];
    }

    get value(): ParsedDate { return this._value; }

    public compare(subjectDate: Date): boolean {
        // We want to compare only the fields given in this._value,
        // so we copy subjectDate and apply on those fields from this._value.
        const temp = new Date(subjectDate.valueOf());
        for (let [field] of dateGetters) {
            if (field in this._value.attempt) {
                dateSetters.get(field).call(
                    temp,
                    dateGetters.get(field).call(this._value.date)
                );
            }
        }

        if (this._operator == QueryOperator.Equal) {
            return subjectDate.getTime() == temp.getTime();
        } else if (this._operator == QueryOperator.Lower) {
            return subjectDate < temp;
        }
        return subjectDate > temp;
    }
    
    asDTO(): QueryDTO {
        let out = super.asDTO();
        out.class = "date";
        out.value = this._value.attempt;
        return out;
    }
}

export interface SearchableItem {
    matchesSearch: (query: string) => boolean;
}

export type SearchableItems = { [id: string]: SearchableItem };

export class Search {
    private _c: SearchConfiguration;
    private _sortField: string = "";
    private _ascending: boolean = true; 
    private _ordering: string[] = [];
    private _items: SearchableItems = {};
    // Search queries (filters)
    private _queries: Query[] = [];
    // Plain-text search terms
    private _searchTerms: string[] = [];
    inSearch: boolean = false;
    private _inServerSearch: boolean = false;
    get inServerSearch(): boolean { return this._inServerSearch; }
    set inServerSearch(v: boolean) {
        const previous = this._inServerSearch;
        this._inServerSearch = v;
        if (!v && previous != v) {
            this._c.clearServerSearch();
        }
    }

    private _serverSearchButtons: HTMLElement[];

    static tokenizeSearch = (query: string): string[] => {
        query = query.toLowerCase();

        let words: string[] = [];
        let quoteSymbol = ``;
        let queryStart = -1;
        let lastQuote = -1;
        for (let i = 0; i < query.length; i++) {
            if (queryStart == -1 && query[i] != " " && query[i] != `"` && query[i] != `'`) {
                queryStart = i;
            }
            if ((query[i] == `"` || query[i] == `'`) && (quoteSymbol == `` || query[i] == quoteSymbol)) {
                if (lastQuote != -1) {
                    lastQuote = -1;
                    quoteSymbol = ``;
                } else {
                    lastQuote = i;
                    quoteSymbol = query[i];
                }
            }

            if (query[i] == " " || i == query.length-1) {
                if (lastQuote != -1) {
                    continue;
                } else {
                    let end = i+1;
                    if (query[i] == " ") {
                        end = i;
                        while (i+1 < query.length && query[i+1] == " ") {
                            i += 1;
                        }
                    }
                    words.push(query.substring(queryStart, end).replace(/['"]/g, ""));
                    queryStart = -1;
                }
            }
        }
        return words;
    }

    parseTokens = (tokens: string[]): [string[], Query[]] => {
        let queries: Query[] = [];
        let searchTerms: string[] = [];

        for (let word of tokens) {
            // 1. Normal search text, no filters or anything
            if (!word.includes(":")) {
                searchTerms.push(word);
                continue;
            }
            // 2. A filter query of some sort.
            const split = [word.substring(0, word.indexOf(":")), word.substring(word.indexOf(":")+1)];
            
            if (!(split[0] in this._c.queries)) continue;

            const queryFormat = this._c.queries[split[0]];

            let q: Query | null = null;

            if (queryFormat.bool) {
                let [boolState, isBool] = BoolQuery.paramsFromString(split[1]);
                if (isBool) {
                    q = new BoolQuery(queryFormat, boolState);
                    q.onclick = () => {
                        for (let quote of [`"`, `'`, ``]) {
                            this._c.search.value = this._c.search.value.replace(split[0] + ":" + quote + split[1] + quote, "");
                        }
                        this._c.search.oninput((null as Event));
                    };
                }
            } else if (queryFormat.string) {
                q = new StringQuery(queryFormat, split[1]);

                q.onclick = () => {
                    for (let quote of [`"`, `'`, ``]) {
                        let regex = new RegExp(split[0] + ":" + quote + split[1] + quote, "ig");
                        this._c.search.value = this._c.search.value.replace(regex, "");
                    }
                    this._c.search.oninput((null as Event));
                }
            } else if (queryFormat.date) {
                let [parsedDate, op, isDate] = DateQuery.paramsFromString(split[1]);
                if (!isDate) continue;
                q = new DateQuery(queryFormat, op, parsedDate);
                
                q.onclick = () => {
                    for (let quote of [`"`, `'`, ``]) {
                        let regex = new RegExp(split[0] + ":" + quote + split[1] + quote, "ig");
                        this._c.search.value = this._c.search.value.replace(regex, "");
                    }
                    
                    this._c.search.oninput((null as Event));
                }
            }
        
            if (q != null) queries.push(q);
        }
        return [searchTerms, queries];
    }

    // Returns a list of identifiers (used as keys in items, values in ordering).
    search = (query: string): string[] => {
        this._c.filterArea.textContent = "";
        
        let result: string[] = [...this._ordering];
        // If we're in a server search already, the results are already correct.
        if (this.inServerSearch) return result;

        const [searchTerms, queries] = this.parseTokens(Search.tokenizeSearch(query));

        query = "";

        for (let term of searchTerms) {
            let cachedResult = [...result];
            for (let id of cachedResult) {
                const u = this.items[id];
                if (!u.matchesSearch(term)) {
                    result.splice(result.indexOf(id), 1);
                }
            }
        }
        for (let q of queries) {
            this._c.filterArea.appendChild(q.asElement());
            let cachedResult = [...result];
            if (q.subject.bool) {
                for (let id of cachedResult) {
                    const u = this.items[id];
                    // Remove from result if not matching query
                    if (!q.compareItem(u)) {
                        // console.log("not matching, result is", result);
                        result.splice(result.indexOf(id), 1);
                    }
                }
            } else if (q.subject.string) {
                for (let id of cachedResult) {
                    const u = this.items[id];
                    // We want to compare case-insensitively, so we get value, lower-case it then compare,
                    // rather than doing both with compareItem.
                    const value = q.getValueFromItem(u).toLowerCase();
                    if (!q.compare(value)) {
                        result.splice(result.indexOf(id), 1);
                    }
                }
            } else if(q.subject.date) {
                for (let id of cachedResult) {
                    const u = this.items[id];
                    // Getter here returns a unix timestamp rather than a date, so we can't use compareItem.
                    const unixValue = q.getValueFromItem(u);
                    if (unixValue == 0) {
                        result.splice(result.indexOf(id), 1);
                        continue;
                    }
                    let value = new Date(unixValue*1000);

                    if (!q.compare(value)) {
                        result.splice(result.indexOf(id), 1);
                    }
                }
            }
        }

        this._queries = queries;
        this._searchTerms = searchTerms;

        return result;
    }
    
    showHideSearchOptionsHeader = () => {
        let sortingBy = false;
        if (this._c.sortingByButton) sortingBy = !(this._c.sortingByButton.parentElement.classList.contains("hidden"));
        const hasFilters = this._c.filterArea.textContent != "";
        if (sortingBy || hasFilters) {
            this._c.searchOptionsHeader.classList.remove("hidden");
        } else {
            this._c.searchOptionsHeader.classList.add("hidden");
        }
    }

    // -all- elements.
    get items(): { [id: string]: SearchableItem } { return this._items; }
    // set items(v: { [id: string]: SearchableItem }) {
    //     this._items = v;
    // }

    // The order of -all- elements (even those hidden), by their identifier.
    get ordering(): string[] { return this._ordering; }
    // Specifically dis-allow setting ordering itself, so that setOrdering is used instead (for the field and ascending params).
    // set ordering(v: string[]) { this._ordering = v; }
    setOrdering = (v: string[], field: string, ascending: boolean) => {
        this._ordering = v;
        this._sortField = field;
        this._ascending = ascending;
    }

    get sortField(): string { return this._sortField; }
    get ascending(): boolean { return this._ascending; }

    onSearchBoxChange = (newItems: boolean = false, loadAll: boolean = false) => {
        const query = this._c.search.value;
        if (!query) {
            this.inSearch = false;
        } else {
            this.inSearch = true;
        }
        const results = this.search(query);
        this._c.setVisibility(results, true);
        this._c.onSearchCallback(results.length, newItems, loadAll);
        if (this.inSearch) {
            if (this.inServerSearch) {
                this._serverSearchButtons.forEach((v: HTMLElement) => {
                    v.classList.add("@low");
                    v.classList.remove("@high");
                });
            } else {
                this._serverSearchButtons.forEach((v: HTMLElement) => {
                    v.classList.add("@high");
                    v.classList.remove("@low");
                });
            }
        }
        this.showHideSearchOptionsHeader();
        this.setNotFoundPanelVisibility(results.length == 0);
        if (this._c.notFoundCallback) this._c.notFoundCallback(results.length == 0);
    }

    setNotFoundPanelVisibility = (visible: boolean) => {
        if (this._inServerSearch || !this.inSearch) {
            this._c.notFoundLocallyText.classList.add("unfocused");
        } else if (this.inSearch) {
            this._c.notFoundLocallyText.classList.remove("unfocused");
        }
        if (visible) {
            console.log("showing not found panel");
            this._c.notFoundPanel.classList.remove("unfocused");
        } else {
            console.log("hiding not found panel");
            this._c.notFoundPanel.classList.add("unfocused");
        }
    }

    fillInFilter = (name: string, value: string, offset?: number) => {
        this._c.search.value = name + ":" + value + " " + this._c.search.value;
        this._c.search.focus();
        let newPos = name.length + 1 + value.length;
        if (typeof offset !== 'undefined')
            newPos += offset;
        this._c.search.setSelectionRange(newPos, newPos);
        this._c.search.oninput(null as any);
    };

    // FIXME: Make XQuery classes less specifically for in-progress searches, and include this code for making info button things.
    generateFilterList = () => {
        // Generate filter buttons
        for (let queryName of Object.keys(this._c.queries)) {
            const query = this._c.queries[queryName];
            if ("show" in query && !query.show) continue;
            if ("dependsOnElement" in query && query.dependsOnElement) {
                const el = document.querySelector(query.dependsOnElement);
                if (el === null) continue;
            }

            const container = document.createElement("span") as HTMLSpanElement;
            container.classList.add("button", "button-xl", "~neutral", "@low", "mb-1", "mr-2", "align-bottom");
            container.innerHTML = `
            <div class="flex flex-col mr-2">
                <span>${query.name}</span>
                <span class="support">${query.description || ""}</span>
            </div>
            `;
            if (query.bool) {
                const pos = document.createElement("button") as HTMLButtonElement;
                pos.type = "button";
                pos.ariaLabel = `Filter by "${query.name}": True`;
                pos.classList.add("button", "~positive", "ml-2");
                pos.innerHTML = `<i class="ri-checkbox-circle-fill"></i>`;
                pos.addEventListener("click", () => this.fillInFilter(queryName, "true"));
                const neg = document.createElement("button") as HTMLButtonElement;
                neg.type = "button";
                neg.ariaLabel = `Filter by "${query.name}": False`;
                neg.classList.add("button", "~critical", "ml-2");
                neg.innerHTML = `<i class="ri-close-circle-fill"></i>`;
                neg.addEventListener("click", () => this.fillInFilter(queryName, "false"));

                container.appendChild(pos);
                container.appendChild(neg);
            }
            if (query.string) {
                const button = document.createElement("button") as HTMLButtonElement;
                button.type = "button";
                button.classList.add("button", "~urge", "ml-2");
                button.innerHTML = `<i class="ri-equal-line mr-2"></i>${window.lang.strings("matchText")}`;

                // Position cursor between quotes
                button.addEventListener("click", () => this.fillInFilter(queryName, `""`, -1));
                
                container.appendChild(button);
            }
            if (query.date) {
                const onDate = document.createElement("button") as HTMLButtonElement;
                onDate.type = "button";
                onDate.classList.add("button", "~urge", "ml-2");
                onDate.innerHTML = `<i class="ri-calendar-check-line mr-2"></i>On Date`;
                onDate.addEventListener("click", () => this.fillInFilter(queryName, `"="`, -1));

                const beforeDate = document.createElement("button") as HTMLButtonElement;
                beforeDate.type = "button";
                beforeDate.classList.add("button", "~urge", "ml-2");
                beforeDate.innerHTML = `<i class="ri-calendar-check-line mr-2"></i>Before Date`;
                beforeDate.addEventListener("click", () => this.fillInFilter(queryName, `"<"`, -1));

                const afterDate = document.createElement("button") as HTMLButtonElement;
                afterDate.type = "button";
                afterDate.classList.add("button", "~urge", "ml-2");
                afterDate.innerHTML = `<i class="ri-calendar-check-line mr-2"></i>After Date`;
                afterDate.addEventListener("click", () => this.fillInFilter(queryName, `">"`, -1));
                
                container.appendChild(onDate);
                container.appendChild(beforeDate);
                container.appendChild(afterDate);
            }

            this._c.filterList.appendChild(container);
        }
    }

    onServerSearch = () => {
        const newServerSearch = !this.inServerSearch;
        this.inServerSearch = true;
        this._c.searchServer(this.serverSearchParams(this._searchTerms, this._queries), newServerSearch);
    }

    serverSearchParams = (searchTerms: string[], queries: Query[]): PaginatedReqDTO => {
        let req: ServerSearchReqDTO = {
            searchTerms: searchTerms,
            queries: queries.map((q: Query) => q.asDTO()),
            limit: -1,
            page: 0,
            sortByField: this.sortField,
            ascending: this.ascending
        };
        return req;
    }

    setServerSearchButtonsDisabled = (disabled: boolean) => {
        this._serverSearchButtons.forEach((v: HTMLButtonElement) => v.disabled = disabled);
    }

    constructor(c: SearchConfiguration) {
        // FIXME: Remove!
        if (c.search.id.includes("activity")) {
            (window as any).s = this;
        }
        this._c = c;

        this._c.search.oninput = () => {
            this.inServerSearch = false;
            this.onSearchBoxChange();
        }
        this._c.search.addEventListener("keyup", (ev: KeyboardEvent) => {
            if (ev.key == "Enter") {
                this.onServerSearch();
            }
        });

        const clearSearchButtons = Array.from(document.querySelectorAll(this._c.clearSearchButtonSelector)) as Array<HTMLSpanElement>;
        for (let b of clearSearchButtons) {
            b.addEventListener("click", () => {
                this._c.search.value = "";
                this.inServerSearch = false;
                this.onSearchBoxChange();
            });
        }
        
        this._serverSearchButtons = Array.from(document.querySelectorAll(this._c.serverSearchButtonSelector)) as Array<HTMLSpanElement>;
        for (let b of this._serverSearchButtons) {
            b.addEventListener("click", () => {
                this.onServerSearch();
            });
        }
    }
}
