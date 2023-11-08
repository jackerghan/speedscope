import {Profile, ProfileGroup, FrameInfo, CallTreeProfileBuilder} from '../lib/profile'

enum TraceType {
    Call,
    Wall,
    Cpu,
}

type Thread = {
    name: string
    id: number
    builder: CallTreeProfileBuilder
    time: number
    baseCpuTime?: number
    totalCpuTime: number
    calls: number
    pending: number[]
    stack: Array<FrameInfo>
}

enum Action {
    Enter = 0,
    Exit,
    Unwind,
}

type MethodInfo = Map<number, FrameInfo>;
type ParseContext = {
    traceType: TraceType;
    methods: MethodInfo;
    recordIssues: number;
}

class BinaryReader {
    private _buffer: Uint8Array;
    private _pos: number;
    private _decoder = new TextDecoder();
    constructor(buffer: Uint8Array, pos: number = 0) {
        this._buffer = buffer;
        this._pos = pos;
    }

    advance(length: number): number {
        this._pos += length;
        if (this._pos > this._buffer.length) {
            this._pos = this._buffer.length;
        }
        return this._pos;
    }

    hasBytes(length: number): boolean {
        return this._pos + length <= this._buffer.length;
    }

    getPos(): number {
        return this._pos;
    }

    setPos(pos: number): number {
        this._pos = pos;
        if (this._pos > this._buffer.length) {
            this._pos = this._buffer.length;
        }
        return this._pos;
    }

    getLine(): string {
        let lineEnd = this._buffer.indexOf(0xa, this._pos);
        if (lineEnd === -1) {
            lineEnd = this._buffer.length;
        }
        const line = this._decoder.decode(this._buffer.subarray(this._pos, lineEnd));
        // Skip over the newline.
        this._pos = lineEnd + 1;
        if (this._pos > this._buffer.length) {
            this._pos = this._buffer.length;
        }
        return line;
    }

    getString(length: number): string {
        const str = this._decoder.decode(this._buffer.subarray(this._pos, this._pos + length));
        this._pos += length;
        if (this._pos > this._buffer.length) {
            this._pos = this._buffer.length;
        }
        return str;
    }

    getByte(): number {
        if (this._pos + 1 > this._buffer.length) {
            this._pos = this._buffer.length;
            return 0;
        }
        let val = this._buffer[this._pos++];
        return val;
    }

    getShort(): number {
        if (this._pos + 2 > this._buffer.length) {
            this._pos = this._buffer.length;
            return 0;
        }
        let val = this._buffer[this._pos++];
        val |= this._buffer[this._pos++] << 8;
        return val;
    }

    getInt() {
        if (this._pos + 4 > this._buffer.length) {
            this._pos = this._buffer.length;
            return 0;
        }
        let val = this._buffer[this._pos++];
        val |= this._buffer[this._pos++] << 8;
        val |= this._buffer[this._pos++] << 16;
        val |= this._buffer[this._pos++] << 24;
        return val;
    }

    getLong() {
        if (this._pos + 8 > this._buffer.length) {
            this._pos = this._buffer.length;
            return 0;
        }
        let val = this._buffer[this._pos++];
        val |= this._buffer[this._pos++] << 8;
        val |= this._buffer[this._pos++] << 16;
        val |= this._buffer[this._pos++] << 24;
        val |= this._buffer[this._pos++] << 32;
        val |= this._buffer[this._pos++] << 40;
        val |= this._buffer[this._pos++] << 48;
        val |= this._buffer[this._pos++] << 56;
        return val;
    }
}

export function importFromAndroidMethodTrace(fileName: string, fileData: ArrayBuffer) : ProfileGroup | null {
    const min_trace_version = 3;
    const buffer = new Uint8Array(fileData);
    const reader = new BinaryReader(buffer);
    const traceType = getTraceType(fileName);

    // Read the sections. Start by checking the version.
    let line = reader.getLine();
    if (line !== '*version') {
        return null;
    }
    line = reader.getLine();
    if (Number(line) < min_trace_version) {
        console.warn('Unsupported Android method trace version')
        return null;
    }

    // Read the headers.
    const headers = new Map<string, string>();
    for (; ;) {
        line = reader.getLine();
        if (!line) {
            console.warn('Bad or incomplete trace ${reader.getPos()}')
            return null;
        }
        if (line === '*threads') {
            break;
        }
        const [key, value] = line.split('=');
        headers.set(key, value);
    }
    if (headers.get('clock') !== 'dual') {
        console.warn('Unsupported Android method trace clock')
    }

    // Read the threads.
    const threads = new Map<number, Thread>();
    for (; ;) {
        line = reader.getLine();
        if (!line) {
            console.warn('Bad or incomplete trace ${reader.getPos()}')
            return null;
        }
        if (line === '*methods') {
            break;
        }
        const [idStr, name] = line.split('\t');
        const id = Number(idStr);
        const thread = {
            name,
            id,
            builder: new CallTreeProfileBuilder,
            calls: 0,
            time: 0,
            totalCpuTime: 0,
            pending: [],
            stack: [],
        };
        threads.set(id, thread);
    }

    // Read the methods.
    const methods = new Map<number, FrameInfo>();
    for (; ;) {
        line = reader.getLine();
        if (!line) {
            console.warn('Bad or incomplete trace ${reader.getPos()}')
            return null;
        }
        if (line === '*end') {
            break;
        }
        const [id, className, method, _signature, sourceName] = line.split('\t');
        const frame = {
            key: methods.size,
            name: className + '.' + method,
            file: sourceName,
        }
        methods.set(Number(id), frame);
    }

    // Read the binary header.
    const recordsHeaderPos = reader.getPos();
    const magic = reader.getInt();
    if (magic != 0x574f4c53) { // magic: SLOW
        console.warn('Bad Android method trace magic');
        return null;
    }
    const version = reader.getShort();
    if (version < min_trace_version) {
        console.warn('Unsupported Android method trace version')
        return null;
    }
    const headerLength = reader.getShort();
    reader.advance(8) // startTime
    const recordSize = reader.getShort();

    // Read the records.
    const context: ParseContext = {
        methods,
        traceType,
        recordIssues: 0
    };
    reader.setPos(recordsHeaderPos + headerLength);
    let baseWallTimeUs = 0;
    for (let recordStart = reader.getPos();
        reader.hasBytes(recordSize);
        recordStart = reader.setPos(recordStart + recordSize)) {
        const threadId = reader.getShort();
        const methodIdAndAction = reader.getInt();
        const action = (methodIdAndAction & 0x3) as Action;
        const thread = threads.get(threadId);
        if (!thread) {
            console.warn('Unknown thread id', threadId);
            continue;
        }
        if (action == Action.Enter) {
            thread.calls += 1;
        }
        let threadCpuTimeUs = reader.getInt();
        // Remove any CPU time the thread may have accumulated before trace.
        if (thread.baseCpuTime == null) {
            thread.baseCpuTime = threadCpuTimeUs;
        }
        threadCpuTimeUs -= thread.baseCpuTime!;
        if (thread.totalCpuTime < threadCpuTimeUs) {
            thread.totalCpuTime = threadCpuTimeUs;
        }
        if (traceType == TraceType.Call) {
            processRecord(thread, context, methodIdAndAction);
            if (action == Action.Enter) {
                thread.time += 1;
            }
            continue;
        }
        let newTime = thread.time;
        if (traceType == TraceType.Cpu) {
            if (newTime < threadCpuTimeUs) {
                newTime = threadCpuTimeUs;
            }
        } else if (traceType == TraceType.Wall) {
            let wallTimeUs = reader.getInt();
            // Use the time for the first record to start all threads at time zero.
            if (baseWallTimeUs == 0) {
                baseWallTimeUs = wallTimeUs;
            }
            wallTimeUs -= baseWallTimeUs;
            if (newTime < wallTimeUs) {
                newTime = wallTimeUs;
            }
        }
        // We want to split the time between entries recorded at the same time.
        // This requires us to always pend the entries and process them when we
        // see the time change.
        if (newTime != thread.time) {
            processPending(thread, context);
        }
        thread.time = newTime;
        thread.pending.push(methodIdAndAction);
    }
    let maxWallTimeUs = 0;
    const traceEndFrame : FrameInfo = {
        key: -1,
        name: 'TraceEnd'
    };
    if (traceType == TraceType.Wall) {
        for (const thread of threads.values()) {
            if (maxWallTimeUs < thread.time) {
                maxWallTimeUs = thread.time;
            }
        }
    }
    const profiles: Profile[] = [];
    const threadsWithProfiles: Thread[] = [];
    const firstThreads: Thread[] = [];
    for (const thread of threads.values()) {
        // Skip threads with no activity.
        if (thread.calls == 0) {
            continue;
        }
        processPending(thread, context);
        // Extend whatever is on stack until the end of the trace.
        if (traceType == TraceType.Wall) {
            if (thread.time < maxWallTimeUs) {
                thread.time = maxWallTimeUs;
            }
        }
        while (thread.stack.length > 0) {
            const frame = thread.stack.pop()!;
            thread.builder.leaveFrame(frame, thread.time);
        }
        // In case there wasn't anything on stack, add a marker for the end of the trace.
        if (traceType == TraceType.Wall) {
            thread.builder.enterFrame(traceEndFrame, thread.time);
            thread.time += 0.1;
            thread.builder.leaveFrame(traceEndFrame, thread.time);
        }
        // Track threads with profiles except main thread which will be injected first.
        if (thread === threads.values().next().value) {
            firstThreads.push(thread);
        } else {
            threadsWithProfiles.push(thread);
        }
    }
    const sortedThreads = threadsWithProfiles.sort((a, b) => b.totalCpuTime - a.totalCpuTime);
    sortedThreads.unshift(...firstThreads);
    for (const thread of sortedThreads) {
        const profile = thread.builder.build();
        let threadName = String(thread.id);
        if (thread.name) {
            threadName += ' ' + thread.name;
        }
        threadName += ` [${thread.calls} calls, ${thread.totalCpuTime}us]`;
        profile.setName(threadName);
        profiles.push(profile);
    }
    if (context.recordIssues) {
        console.warn(`${context.recordIssues} issues detected in method trace`);
    }
    return {
        name: fileName,
        indexToView: 0,
        profiles,
      };
}

function processPending(thread: Thread, context: ParseContext) {
    if (thread.pending.length == 0) {
        return;
    }
    let timeIncrement = 1 / thread.pending.length;
    for (let methodIdAndAction of thread.pending) {
        processRecord(thread, context, methodIdAndAction);
        thread.time += timeIncrement;
    }
    thread.pending = [];
}

function processRecord(thread: Thread, context: ParseContext, methodIdAndAction: number) {
    const action = (methodIdAndAction & 0x3) as Action;
    const methodId = methodIdAndAction & 0xFFFFFFFC;
    const method = context.methods.get(methodId);
    if (!method) {
        console.warn('Unknown method id', methodId);
        return;
    }
    switch (action) {
        case Action.Enter:
            thread.stack.push(method);
            thread.builder.enterFrame(method, thread.time);
            break;
        case Action.Exit:
        case Action.Unwind:
            const lastMethod = thread.stack.pop()!;
            if (!lastMethod) {
                context.recordIssues++;
                break;
            }
            if (lastMethod.key != method.key) {
                context.recordIssues++;
            }
            thread.builder.leaveFrame(lastMethod, thread.time);
            break;
    }
}

function getTraceType(file: string): TraceType {
    if (file.includes('.cpu.')) {
        return TraceType.Cpu;
    }
    if (file.includes('.wall.')) {
        return TraceType.Wall;
    }
    return TraceType.Call;
}
