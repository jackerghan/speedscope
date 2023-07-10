import { ProfileGroup, FrameInfo, CallTreeProfileBuilder } from '../lib/profile'
import { TextFileContent } from './utils'

import { h } from 'preact'

export type Stats = {
  [id: string]: number;
};

export type FileEntry = {
  key: number;
  name: string;
  managers: string[][];
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
  const filters = getActiveFilters();
  const managerFilter = buildTextFilter(filters.managersInclude, filters.managersExclude);
  const pathFilter = buildTextFilter(filters.pathInclude, filters.pathExclude);
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
    let managersRaw = fields[0];
    const vpFound = managersRaw.indexOf('ritandon');
    if (vpFound >= 0) {
      managersRaw = managersRaw.substring(vpFound);
    }
    if (!matchTextFilter(managersRaw, managerFilter)) {
      continue;
    }
    const managers = managersRaw.split('/');
    const repo = fields[1];
    const editCount = Number(fields[2]);
    const ploc = Number(fields[3]);
    let path = fields[4].trimEnd();
    const repoPrefix = repo + '/';
    if (!path.startsWith(repoPrefix)) {
      path = repoPrefix + path;
    }
    if (!matchTextFilter(path, pathFilter)) {
      continue;
    }
    const pathParts = path.split('/');
    const stats = {
      editCount,
      ploc,
      weight: Math.min(10, editCount),
    };
    totalWeight += stats.weight;
    let parent = root;
    for (const part of pathParts) {
      let fileEntry = parent.children.get(part);
      if (!fileEntry) {
        fileEntry = { key: nextKey++, name: part, managers: [], stats: { ...stats }, children: new Map(), parent };
        parent.children.set(part, fileEntry);
      } else {
        for (const stat of typedKeys(stats)) {
          fileEntry.stats[stat] = stats[stat] + fileEntry.stats[stat] ?? 0;
        }
      }
      // Make sure managers get added to a new file entry or parent directory.
      addManagers(fileEntry.managers, managers);
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

export function typedKeys<T extends Object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

export type RenderTarget = 'tooltip' | 'details';
type Renderer = (fileEntry: FileEntry, target: RenderTarget) => h.JSX.Element;
let rendererImpl: Renderer = () => <div></div>;
export function setRendererImpl(impl: Renderer) {
  rendererImpl = impl;
}

function renderDetails(fileEntry: FileEntry): h.JSX.Element {
  return rendererImpl(fileEntry, 'details');
}

function renderTooltip(fileEntry: FileEntry): h.JSX.Element {
  return rendererImpl(fileEntry, 'tooltip');
}

function addToProfile(context: BuildContext, fileEntry: FileEntry): void {
  const frameInfo: FrameInfo = {
    key: fileEntry.key,
    name: fileEntry.name,
    data: {
      renderTooltip: () => renderTooltip(fileEntry),
      renderDetails: () => renderDetails(fileEntry),
    },
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

function addManagers(addTo: string[][], managers: string[]) {
  for (let i = 0; i < managers.length; i++) {
    let addToLevel: string[];
    if (addTo.length < i + 1) {
      addToLevel = [];
      addTo.push(addToLevel);
    } else {
      addToLevel = addTo[i];
    }
    const manager = managers[i];
    if (addToLevel.indexOf(manager) < 0) {
      addToLevel.push(manager);
    }
  }
}

export function getManagers(managers: string[][]): string {
  const allLevels = [];
  for (const level of managers) {
    if (level.length == 1) {
      allLevels.push(level[0]);
    } else {
      allLevels.push('[' + level.sort().join(',') + ']');
    }
  }
  return allLevels.join('::');
}

export function getPath(fileEntry: FileEntry): string {
  const parts = [];
  for (let current : FileEntry | null = fileEntry; current; current = current.parent) {
    parts.push(current.name);
  }
  return parts.reverse().join('/');
}

function nonLocaleCompare(a: string, b: string): number {
  return (a < b ? -1 : (a > b ? 1 : 0));
}

export type Filters = {
  managersInclude?: string;
  managersExclude?: string;
  pathInclude?: string;
  pathExclude?: string;
  tagsInclude?: string;
  tagsExclude?: string;
  taskSev?: boolean;
  taskSla?: boolean;
  taskPriUbn?: boolean;
  taskPriHigh?: boolean;
  taskPriMid?: boolean;
  taskPriLow?: boolean;
  taskPriWish?: boolean;
}

let activeFilters: Filters = {};

export function getActiveFilters(): Filters {
  return activeFilters;
}

export function setActiveFilters(filters: Filters) {
  activeFilters = filters;
}

type TextFilter = {
  includes: Array<string>;
  excludes: Array<string>;
};

function inputToFilterArray(input: string | undefined) {
  if (!input) {
    return [];
  }
  const patterns = input.split(' ');
  // Filter out zero length patterns
  return patterns.filter((v) => v.length != 0).map((e) => e.toLocaleLowerCase());
}

function buildTextFilter(includesInput: string | undefined, excludesInput: string | undefined): TextFilter {
  const includes = inputToFilterArray(includesInput);
  const excludes = inputToFilterArray(excludesInput);
  return {excludes, includes};
}

function matchTextFilter(key: string, filters: TextFilter) {
  const keylc = key.toLowerCase();
  // If there are includes, key must match at least one.
  if (filters.includes.length) {
    let matched = false;
    for (const pattern of filters.includes) {
      if (keylc.includes(pattern)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return false;
    }
  }
  // Check for excludes.
  for (const pattern of filters.excludes) {
    if (keylc.includes(pattern)) {
      return false;
    }
  }
  return true;
}
