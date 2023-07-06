// https://github.com/tmm1/stackprof

import { ProfileGroup, FrameInfo, CallTreeProfileBuilder } from '../lib/profile'
import {TextFileContent} from './utils'

type Stats = {
  [id: string]: number;
};

type FileEntry = {
  key: number;
  name: string;
  managers: string[];
  stats: Stats;
  children: Map<string, FileEntry>;
  parent: FileEntry | null;
}

type BuildContext = {
  profile: CallTreeProfileBuilder;
  runningWeight: number;
}

export function importWorkTrack(contents: TextFileContent, fileName: string): ProfileGroup {
  let totalWeight = 0;
  let nextKey = 100;
  const root: FileEntry = {
    key: nextKey++,
    name: 'Root',
    managers: [],
    stats: {},
    parent: null,
    children: new Map(),
  };
  let lineIndex = 0;
  for (const line of contents.splitLines()) {
    // Skip the header line.
    if (lineIndex++ == 0) {
      continue;
    }
    const fields = line.split(/,/);
    if (fields.length != 5) {
      console.warn('Bad line: ', lineIndex, line);
      continue;
    }
    const managers = fields[0].split('/');
    const repo = fields[1];
    const editCount = Number(fields[2]);
    const ploc = Number(fields[3]);
    const path = `[${repo}]/${fields[4]}`;
    const pathParts = path.split('/');
    const stats = {
      editCount,
      ploc,
      weight: Math.min(5, editCount),
    };
    totalWeight += stats.weight;
    let parent = root;
    for (const part of pathParts) {
      let fileEntry = parent.children.get(part);
      if (!fileEntry) {
        fileEntry = { key: nextKey++, name: part, managers, stats: {...stats}, children: new Map(), parent };
        parent.children.set(part, fileEntry);
      } else {
        // Tag the parent directories with the managers.
        for (const manager of managers) {
          if (fileEntry.managers.indexOf(manager) === -1) {
            fileEntry.managers.push(manager);
          }
        }
        for (const stat of typedKeys(stats)) {
          fileEntry.stats[stat] = stats[stat] + fileEntry.stats[stat] ?? 0;
        }
      }
      parent = fileEntry;
    }
  }

  const buildContext = {
    runningWeight: 0,
    profile: new CallTreeProfileBuilder(totalWeight)
  };
  addToProfile(buildContext, root);
  const builtProfile = buildContext.profile.build();
  return {
    name: 'Work ' + fileName,
    indexToView: 0,
    profiles: [builtProfile],
  }
}

function typedKeys<T extends Object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

function addToProfile(context: BuildContext, fileEntry: FileEntry): void {
  const frameInfo: FrameInfo = {
    key: fileEntry.key,
    name: fileEntry.name,
    file: fileEntry.managers.join(':'),
    line: fileEntry.stats.ploc,
  };
  context.profile.enterFrame(frameInfo, context.runningWeight);
  if (fileEntry.children.size) {
    const children = [...fileEntry.children.entries()].sort((a, b) => nonLocaleCompare(a[0], b[0]));
    for (const child of children) {
      addToProfile(context, child[1]);
    }
  } else {
    context.runningWeight += fileEntry.stats.weight;
  }
  context.profile.leaveFrame(frameInfo, context.runningWeight);
}

function nonLocaleCompare(a: string, b: string): number {
  return (a < b ? -1 : (a > b ? 1 : 0));
}
