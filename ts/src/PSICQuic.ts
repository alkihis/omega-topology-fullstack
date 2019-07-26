import ReversibleKeyMap from 'reversible-key-map';
import { PSQData } from './PSICQuicData';
import { setIntersection, countFileLines } from './helpers';

export type PSQDataHolder = ReversibleKeyMap<string, string, PSQData[]>;

export default class PSICQuic {
    /**
     * Records of Mitab currently loaded.
     */
    public records: PSQDataHolder = new ReversibleKeyMap;

    /**
     * Registered publications. (I don't know what it is, please be comprehensive)
     */
    public registredPublications: { [pubId: string]: string } = {};
    protected init_promise = Promise.resolve();

    /**
     * Creates an instance of PSICQuic.
     * @param {string} [mode="LOOSE"] >deprecated Unused.
     * @param {boolean} [keep_raw=false] Keep the raw line when creating PSQData children.
     */
    constructor(protected mode = "LOOSE", protected keep_raw = false) { }

    /**
     * Promise symbolizing the instance state. Resolved when ready.
     */
    init() {
        return this.init_promise;
    }

    /**
     * Read one or multiple Mitab lines and register then in records.
     *
     * @param {(string | string[])} str
     */
    readLines(str: string | string[]) {
        if (typeof str === 'string') {
            str = str.split('\n');
        }

        const added_psq: PSQData[] = [];
        for (const line of str) {
            this.parseLine(line, added_psq);
        }

        return added_psq;
    }

    /**
     * Asynchronously read a Mitabfile. (use streams !)
     * 
     * @nodeonly Only for Node.js. Will fail if used inside a browser context.
     * @rameater This function, used with a big file, will require a huge amount of RAM. 
     * Make sure to use the V8 `--max-old-space-size={RAM}` parameter when starting the script.
     *
     * @param {string} file Filename
     * @param {boolean} [with_progress=true] Create a progress bar of current read state.
     */
    async read(file: string, with_progress = true) {
        const fs = require("fs");
        const readline = require("readline");
        const ProgressBar = require("progress");

        let lineCount = 0;
        if (with_progress)
            lineCount = await countFileLines(file);

        let lineNr = 0;
        let bar: ProgressBar = undefined;
        if (with_progress)
            bar = new ProgressBar(':current/:total :bar (:percent, :etas) ', { total: lineCount + 1, complete: "=", incomplete: " ", head: '>' });

        return new Promise(resolve => {
            const lineReader = readline.createInterface({
                input: fs.createReadStream(file)
            });
            lineReader.on('line', (line) => {
                lineNr += 1;
                if (bar)
                    bar.tick();

                this.parseLine(line);
            });
            lineReader.on("close", () => {
                if (bar)
                    bar.terminate();
                else
                    console.log('Read entire file. (' + lineNr + ') lines');
                resolve();
            });
        });
    }

    /**
     * Add all the records of other to actual instance.
     *
     * @param {PSICQuic} other
     */
    plus(other: PSICQuic) {
        for (const [, value] of other.records) {
            this.add(...value);
        }
    }

    /**
     * Check if PSQData is valid and register publications inside it.
     *
     * @protected
     * @param {PSQData} psqDataObj
     */
    protected checkPsqData(psqDataObj: PSQData) {
        const pmid = psqDataObj.pmid!;
        const source = psqDataObj.source!.toLowerCase();
        if (!(pmid in this.registredPublications)) {
            this.registredPublications[pmid] = source;
            console.log("Putting " + source +  ' in ' +  this.registredPublications[pmid]);
            console.log(psqDataObj);
            return true;
        }       
        
        if (this.registredPublications[pmid] == source) {
            return true;
        }
        else {
            console.log("Warning publication " + pmid + " provided by " + source + " has already been fetched from " + this.registredPublications[pmid]);
            console.log(psqDataObj);
            return false;
        }
    }

    /**
     * Size of the records map.
     */
    get length() : number {
        return this.records.size;
    }

    toString() : string {
        return [...this.records.values()].map(e => e.toString()).join("\n");
    }

    get [Symbol.toStringTag]() {
        return "PSICQuic";
    }

    /**
     * Returns true of id exists in records.
     *
     * @param {string} id
     */
    has(id: string) : boolean {
        return this.records.has(id);
    }

    /**
     * Returns true if couple [id1, id2] exists in records.
     *
     * @param {string} id1
     * @param {string} id2
     */
    hasCouple(id1: string, id2: string) : boolean {
        return this.records.hasCouple(id1, id2);
    }

    /**
     * Get all the lines associated to id.
     *
     * @param {string} id
     */
    get(id: string) : PSQData[] {
        if (this.has(id)) {
            return [].concat(...this.records.getAllFrom(id).values());
        }
        return [];
    }

    /**
     * @deprecated Alias for `.getCouple()`.
     * @alias .getCouple()
     * @see .getCouple()
     */
    getLines(id1: string, id2: string) : PSQData[] {
        return this.getCouple(id1, id2);
    }

    /**
     * Get all the MI Tab lines and data associated to couple [id1, id2].
     * 
     * @param {string} id1
     * @param {string} id2
     */
    getCouple(id1: string, id2: string) : PSQData[] {
        if (this.hasCouple(id1, id2)) {
            return this.records.get(id1, id2);
        }
        return [];
    }

    /**
     * @deprecated Alias for `.add()` with the support of only one PSQData at each call.
     * @alias .add()
     * @see .add()
     */
    update(psq: PSQData) {
        this.add(psq);
    }

    /**
     * Register a PSQData in records.
     *
     * @param psq MI Tab data (one, or mulitple data)
     */
    add(...psqs: PSQData[]) {
        for (const psq of psqs) {
            const [id1, id2] = psq.ids;

            const actual_array = this.getCouple(id1, id2);

            // Check if line already exists
            if (actual_array.every(line => !line.equal(psq))) {
                actual_array.push(psq);
                this.records.set(id1, id2, actual_array);
            }
        }
    }
    
    /**
     * Yields through the recorded PSQData.
     * 
     * @yields {PSQData}
     */
    *[Symbol.iterator]() : IterableIterator<PSQData> {
        for (const lines of this.records.values()) {
            yield* lines;
        }
    }

    /**
     * Yields though the couples in records, with the form [id1, id2, lines_from_couple].
     * 
     * @yields {[string, string, PSQData[]]}
     */
    *couples() {
        for (const [keys, lines] of this.records) {
            yield [keys[0], keys[1], lines] as [string, string, PSQData[]];
        }
    }

    /**
     * Get all the existing pairs with the form id => partners[].
     * Pairs will exists in both forms : id1 => [id2, id3] and id2 => [id1] and id3 => [id1]
     */
    getAllPartnersPairs() {
        const couples: { [id: string]: Iterable<string> } = {};

        for (const [keys, ] of this.records) {
            const [id1, id2] = keys;

            if (id1 in couples)
                (couples[id1] as Set<string>).add(id2);
            else
                couples[id1] = new Set([id2]);
            
            if (id2 in couples)
                (couples[id2] as Set<string>).add(id1);
            else
                couples[id2] = new Set([id1]);
        }

        for (const key in couples) {
            // Transformation en tableau
            couples[key] = [...couples[key]];
        }

        return couples as { [id: string]: string[] };
    }

    /**
     * Get all the lines represented with the couple {id1 => id2 => string[], ...}
     */
    getAllLinesPaired() {
        const couples: { 
            [id: string]: {
                [coupledId: string]: string[]
            }
        } = {};

        for (const [keys, values] of this.records) {
            const [id1, id2] = keys;

            if (!(id1 in couples)) {
                couples[id1] = {};
            }

            if (!(id2 in couples)) {
                couples[id2] = {};
            }
            
            couples[id2][id1] = couples[id1][id2] = values.map(v => v.raw);
        }

        return couples;
    }

    /**
     * Delete every raw line contained in this instance, then disable keep_raw.
     */
    flushRaw() {
        this.keep_raw = false;
        for (const psqData of this) {
            psqData.raw = undefined;
        }
    }

    /**
     * Clear every Mitab records and publications saved.
     */
    clear() {
        this.records.clear();
        this.registredPublications = {};
    }

    /** 
     * Make a JSON dump
     */
    json() {
        return '{"type" : "mitabResult", "data" : [' + [...this].map(e => e.json).join(',') + '] }';
    }

    /**
     * Parse multiple lines then add then into the instance.
     *
     * @param {string[]} buffer Lines into a string[] object.
     */
    protected parse(buffer: string[]) {
        for (const line of buffer) {
            if (!line || line.startsWith('#')) {
                continue;
            }

            this.add(new PSQData(line, this.keep_raw));
        }
    }

    /**
     * Parse one line.
     *
     * @param {string} line
     * @param {PSQData[]} [added] Optional. Used to monitor which line is added.
     */
    protected parseLine(line: string, added?: PSQData[]) {
        if (line.length === 0 || line.startsWith('#')) {
            return;
        }

        const d = new PSQData(line, this.keep_raw);
        if (added) added.push(d);
        this.add(d);
    } 
    
    /**
     * Return all the PubMed IDs presents in the records
     */
    protected countPmid() {
        return new Set([...this].map(e => e.pmid!));
    }

    /**
     * Get all the protein IDs and the "links" currently makables with current records.
     * 
     * @returns Tuple<Set of protein accession n., Map<ProtID1, ProtID2, MITab data>>
     */
    topology() : [Set<string>, Map<[string, string], PSQData[]>] {
        const nodes = new Set<string>();
        const edges = new Map<[string, string], PSQData[]>();

        // call this.@@iterator
        for (const p of this) {
            const t = p.uniprotPair;

            if (!t) {
                continue;
            }

            t.forEach(n => nodes.add(n));

            const arr = edges.get(t);
            if (arr) {
                arr.push(p);
            }
            else {
                edges.set(t, [p]);
            }
        }

        return [nodes, edges];
    }

    /**
     * @deprecated
     */
    getBiomolecules(type = 'uniprot') {
        if (type === 'uniprot') {
            let l: string[] = [];

            for (const p of this) {
                const up = p.uniprotPair;
                if (up) {
                    l.push(...up);
                }
            }

            return [...new Set(l)];
        }
    }

    /**
     * Create a new PSICQuic object with current instance data who match the predicate or who match the given uniprot ids
     * @param uniprot 
     * @param predicate 
     */
    filter(uniprot: string[] = [], predicate?: Function) {
        const target = new PSICQuic;

        if (uniprot.length) {
            const buffer = new Set(uniprot);

            for (const data of this) {
                let up: [string, string] | Set<string> = data.uniprotPair;
                if (!up) {
                    continue;
                }

                up = new Set(up);
                if (setIntersection(up, buffer).size) {
                    target.add(data);
                }
            }
        }
        
        if (predicate) {
            for (const data of this) {
                if (predicate(data)) target.add(data);
            }
        }

        return target;
    }
}