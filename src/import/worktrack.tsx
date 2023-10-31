import { ProfileGroup, FrameInfo, CallTreeProfileBuilder } from '../lib/profile'
import { TextFileContent } from './utils'

import { h } from 'preact'

export const maxDiffPeek = 5

export enum WorkConsts {
  maxDiffPeek = 5,
}

export type Stats = {
  [id: string]: number
}

export type Datas = {
  [id: string]: number
}

export type DiffEntry = {
  id: number
  fbid: string
  dateClosed: number
  lineCount: number
  substantialLineCount: number
  author: string
  clocDelta: number
  llocDelta: number
  plocDelta: number
  isCodeMod: boolean
  isBot: boolean
  title: string
  fileCount: number
  extensions: string[]
  taskIds: number[]
  reviewers: string[]
  commenters: string[]
  acceptors: string[]
  managersRaw: string
  tasks: TaskEntry[]
  parsedFiles: ParsedFileEntry[]
  // Fields below this line are updated at filtering time.
  filteredFileCount: number
  matched: boolean
}

export type TaskEntry = {
  id: number
  title: string
  priority: number
  taskType: number
  tags: Set<string>
  is_sla: boolean
  sla_start: number
  sla_completion: number
  sla_deadline: number
}

export type ParsedFileEntry = {
  managersRaw: string
  pathRaw: string
  pathParts: string[]
  diffs: DiffEntry[]
  stats: Stats
  datas: Datas
  // Fields below this line are updated at filtering time.
  file: FileEntry | null
}

type FileWorkContent = {
  diffs: Map<string, DiffEntry>
  tasks: Map<number, TaskEntry>
  files: ParsedFileEntry[]
}

interface FileWithWorkContent extends TextFileContent {
  workContent?: FileWorkContent
}

export type FileEntry = {
  key: number
  name: string
  managersByPath: string[][]
  managersByDiff: string[][]
  stats: Stats
  datas: Datas
  children: Map<string, FileEntry>
  parent: FileEntry | null
  diffs: DiffEntry[]
  parsedFile: ParsedFileEntry | null
}

type FilteredFile = {
  file: ParsedFileEntry | null
  diffs: DiffEntry[]
  stats: Stats
  datas: Datas
  diffManagersRaw: string
}

type BuildContext = {
  profile: CallTreeProfileBuilder
  runningWeight: number
}

function parseWorkContent(contents: TextFileContent): FileWorkContent {
  // If we have already parsed the work content, return that!
  const fileWithWorkContent = contents as FileWithWorkContent
  if (fileWithWorkContent.workContent) {
    return fileWithWorkContent.workContent
  }
  let workContent: FileWorkContent = {
    diffs: new Map<string, DiffEntry>(),
    tasks: new Map<number, TaskEntry>(),
    files: [],
  }
  let lineIndex = 0
  let fieldCount = 0
  const lineIterator = contents.splitLines()[Symbol.iterator]()
  // Parse the diff info.
  fieldCount = 0
  for (let lineEntry = lineIterator.next(); !lineEntry.done; lineEntry = lineIterator.next()) {
    const line = lineEntry.value
    lineIndex++
    // Skip the header line.
    if (lineIndex == 1) {
      continue
    }
    // Break when we come to task info.
    if (line.startsWith('task_number,title,priority')) {
      break
    }
    const fields = trimEnd(line).split(/,/)
    if (fieldCount && fields.length != fieldCount) {
      console.warn('Bad line: ', lineIndex, line)
      continue
    }
    fieldCount = 0
    const diffId = Number(fields[fieldCount++])
    const diffFbid = fields[fieldCount++]
    const dateClosed = Number(fields[fieldCount++])
    const lineCount = Number(fields[fieldCount++])
    const substantialLineCount = Number(fields[fieldCount++])
    const author = fields[fieldCount++]
    const clocDelta = Number(fields[fieldCount++])
    const llocDelta = Number(fields[fieldCount++])
    const plocDelta = Number(fields[fieldCount++])
    const isCodeMod = !!Number(fields[fieldCount++])
    const isBot = !!Number(fields[fieldCount++])
    const title = fields[fieldCount++]
    const fileCount = Number(fields[fieldCount++])
    const extensions = fields[fieldCount++].split('/')
    const taskIds = fields[fieldCount++]
      .split('/')
      .map((x: string) => Number(x))
      .filter((y: number) => y != 0)
    const reviewers = (fields.length <= fieldCount) ? [] : fields[fieldCount++].split('/')
    let managersRaw = (fields.length <= fieldCount) ? '' : fields[fieldCount++]
    // Drop the diff author from the 'managers'.
    managersRaw = managersRaw.split('/').slice(0, -1).join('/');
    const commenters = (fields.length <= fieldCount) ? [] : fields[fieldCount++].split('/').filter((x: string) => x)
    const acceptors = (fields.length <= fieldCount) ? [] : fields[fieldCount++].split('/')
    const diff = {
      id: diffId,
      fbid: diffFbid,
      dateClosed,
      lineCount,
      substantialLineCount,
      author,
      clocDelta,
      llocDelta,
      plocDelta,
      isCodeMod,
      isBot,
      title,
      fileCount,
      extensions,
      taskIds,
      reviewers,
      commenters,
      acceptors,
      managersRaw,
      tasks: [],
      parsedFiles: [],
      filteredFileCount: 0,
      matched: false
    }
    workContent.diffs.set(diffFbid, diff)
  }
  // Parse the task info.
  fieldCount = 0
  for (let lineEntry = lineIterator.next(); !lineEntry.done; lineEntry = lineIterator.next()) {
    const line = lineEntry.value
    lineIndex++
    // Break when we come to file info.
    if (line.startsWith('manager_chain,diff_fbids,')) {
      break
    }
    const fields = trimEnd(line).split(/,/)
    if (fieldCount && fields.length != fieldCount) {
      console.warn('Bad line: ', lineIndex, line)
      continue
    }
    fieldCount = 0
    const taskId = Number(fields[fieldCount++])
    const title = fields[fieldCount++]
    const priority = Number(fields[fieldCount++])
    const taskType = Number(fields[fieldCount++])
    const tags: Set<string> = new Set(fields[fieldCount++].split(':::'))
    const is_sla: boolean = (fields.length <= fieldCount) ? false : !!Number(fields[fieldCount++])
    const sla_start = (fields.length <= fieldCount) ? 0 : Number(fields[fieldCount++])
    const sla_completion = (fields.length <= fieldCount) ? 0 : Number(fields[fieldCount++])
    const sla_deadline = (fields.length <= fieldCount) ? 0 : Number(fields[fieldCount++])
    const task: TaskEntry = {
      id: taskId,
      title,
      priority,
      taskType,
      tags,
      is_sla,
      sla_start,
      sla_completion,
      sla_deadline,
    }
    workContent.tasks.set(taskId, task)
  }
  // Parse the file info.
  fieldCount = 0
  for (let lineEntry = lineIterator.next(); !lineEntry.done; lineEntry = lineIterator.next()) {
    const line = lineEntry.value
    lineIndex++
    const fields = trimEnd(line).split(/,/)
    if (fieldCount && fields.length != fieldCount) {
      console.warn('Bad line: ', lineIndex, line)
      continue
    }
    fieldCount = 0
    let managersRaw = fields[fieldCount++]
    const diffFbids = fields[fieldCount++].split('/')
    const repo = fields[fieldCount++]
    let path = fields[fieldCount++]
    const repoPrefix = repo + '/'
    if (!path.startsWith(repoPrefix)) {
      path = repoPrefix + path
    }
    const authors = new Set<string>();
    const diffs: DiffEntry[] = []
    for (const diffFbid of diffFbids) {
      const diff = workContent.diffs.get(diffFbid)
      if (diff) {
        diffs.push(diff)
        authors.add(diff.author);
      }
    }
    // Sort diffs descending in time order.
    diffs.sort((a, b) => b.dateClosed - a.dateClosed);
    const pathParts = path.split('/')
    const logicalComplexity = Number(fields[fieldCount++])
    const codeCoveragePercent = Number(fields[fieldCount++])
    const userActiveCgtDaysL180 = Number(fields[fieldCount++])
    const userActivePreDiffCgtDaysL180 = Number(fields[fieldCount++])
    const editCount = Number(fields[fieldCount++])
    const ploc = Number(fields[fieldCount++])
    if (!diffs.length) {
      console.warn(`${path} has no diffs with details ${diffFbids}`)
      continue
    }
    const stats: Stats = {
      fileCount: 1,
      editCountL180: editCount,
      ploc,
      rawFileUpdates: diffs.length
    }
    const datas: Datas = {
      rawAuthors: authors.size,
      logicalComplexity,
      codeCoveragePercent,
      userActiveCgtDaysL180,
      userActivePreDiffCgtDaysL180,
    }
    const file: ParsedFileEntry = {
      managersRaw,
      pathParts,
      pathRaw: '/' + path + '/',
      diffs,
      stats,
      datas,
      file: null
    }
    for (const diff of diffs) {
      diff.parsedFiles.push(file);
    }
    workContent.files.push(file)
  }
  // Stitch together diffs and tasks.
  for (const diff of workContent.diffs.values()) {
    diff.parsedFiles.sort((a, b) => nonLocaleCompare(a.pathRaw, b.pathRaw));
    for (const taskId of diff.taskIds) {
      const task = workContent.tasks.get(taskId)
      if (!task) {
        console.warn(`Missing task T${taskId} for diff D${diff.id}`)
        continue
      }
      diff.tasks.push(task)
    }
  }
  // Calculate weighed file update stat.
  for (const file of workContent.files) {
    let rawFileUpdatesWeighed = 0;
    for (const diff of file.diffs) {
      rawFileUpdatesWeighed += (1 / diff.parsedFiles.length);
    }
    file.stats["rawFileUpdatesWeighed"] = rawFileUpdatesWeighed;
  }
  fileWithWorkContent.workContent = workContent
  return workContent
}

export function importWorkTrack(contents: TextFileContent, fileName: string): ProfileGroup {
  const parsedData = parseWorkContent(contents)
  const filters = getActiveFilters()
  const pathFilter = buildTextFilter(filters.pathInclude, filters.pathExclude)
  const diffManagerFilter = buildTextFilter(filters.diffManagersInclude, filters.diffManagersExclude)
  const caManagerFilter = buildTextFilter(filters.caManagersInclude, filters.caManagersExclude)
  const authorFilter = buildTextFilter(filters.authorsInclude, filters.authorsExclude)
  const reviewerFilter = buildTextFilter(filters.reviewersInclude, filters.reviewersExclude)
  const titleFilter = buildTextFilter(filters.titleInclude, filters.titleExclude)
  const taskTitleFilter = buildTextFilter(filters.taskTitleInclude, filters.taskTitleExclude)
  const tagFilter = buildTextFilter(filters.tagsInclude, filters.tagsExclude)
  const priFilter = buildPriorityFilter(filters);
  const dateMin = dateFilterToEpoch(filters.diffDateMin, 0)
  const dateMax = dateFilterToEpoch(filters.diffDateMax, 24 * 60 * 60)
  const fileEvalFilter = buildEvalFilter('stats', 'datas', filters.fileEvalFilter);
  // Determine the TLs we are dealing with.
  const TLs = new Map<string, TL>();
  if (filters.TLs?.length) {
    const tlTagFilter = buildTextFilter(filters.tlTagInclude, filters.tlTagExclude);
    for (const tl of filters.TLs) {
      if (matchTextFilter('/' + tl.tags + '/', tlTagFilter)) {
        TLs.set(tl.unixname, tl);
      }
    }
  }
  // Filter the files to the desired set.
  for (const diff of parsedData.diffs.values()) {
    diff.filteredFileCount = 0;
    diff.matched = false;
    if (dateMin) {
      if (diff.dateClosed < dateMin) {
        continue
      }
    }
    if (dateMax) {
      if (diff.dateClosed >= dateMax) {
        continue
      }
    }
    if (!matchTextFilter(diff.author, authorFilter)) {
      continue
    }
    if (!matchArrayToTextFilter(diff.reviewers, reviewerFilter)) {
      continue;
    }
    if (!matchTextFilter(diff.title, titleFilter)) {
      continue
    }
    const diffTags = new Set<string>()
    const diffTaskPris = new Set<number>();
    let sevDiff = false;
    let slaDiff = false;
    let launchBlockingDiff = false;
    const taskTitles: string[] = [];
    for (const task of diff.tasks) {
      taskTitles.push(task.title);
      sevDiff ||= isSevTask(task);
      slaDiff ||= isSlaTask(task);
      launchBlockingDiff ||= isLaunchBlockingTask(task);
      diffTaskPris.add(task.priority);
      for (const tag of task.tags) {
        diffTags.add(tag)
      }
    }
    if (!matchArrayToTextFilter(taskTitles, taskTitleFilter)) {
      continue
    }
    if (!matchSetToTextFilter(diffTags, tagFilter)) {
      continue
    }
    if (!matchPriorityFilter(diffTaskPris, priFilter)) {
      continue
    }
    // If a category has been specified, one category must match.
    if (filters.taskSev || filters.taskSla || filters.taskLaunchBlocking) {
      let matchedCategory = false;
      if (filters.taskSev && sevDiff) {
        matchedCategory = true;
      }
      if (filters.taskSla && slaDiff) {
        matchedCategory = true
      }
      if (filters.taskLaunchBlocking && launchBlockingDiff) {
        matchedCategory = true
      }
      if (!matchedCategory) {
        continue;
      }
    }
    if (filters.tlLanded || filters.tlApproved || filters.tlCommented ||
      filters.notTLLanded || filters.notTLApproved || filters.notTLCommented) {
      const landed = TLs.has(diff.author);
      const approved = (diff.acceptors.filter(a => TLs.has(a))).length != 0;
      const commentedOnOther = (diff.commenters.filter(a => ((a !== diff.author) && TLs.has(a)))).length != 0;
      if (filters.tlLanded || filters.tlApproved || filters.tlCommented) {
        let matched = false;
        if (filters.tlLanded) {
          matched ||= landed;
        }
        if (filters.tlApproved) {
          matched ||= approved;
        }
        if (filters.tlCommented) {
          matched ||= commentedOnOther;
        }
        if (!matched) {
          continue;
        }
      }
      if (filters.notTLLanded || filters.notTLApproved || filters.notTLCommented) {
        let matched = true;
        if (filters.notTLLanded) {
          matched &&= !landed;
        }
        if (filters.notTLApproved) {
          matched &&= !approved;
        }
        if (filters.notTLCommented) {
          matched &&= !commentedOnOther;
        }
        if (!matched) {
          continue;
        }
      }
    }
    diff.matched = true;
  }
  const filteredFiles : FilteredFile[] = [];
  for (const file of parsedData.files) {
    file.file = null
    if (!matchTextFilter(file.pathRaw, pathFilter)) {
      continue
    }
    // Determine manager chain from diffs.
    let diffManagersRaw = '';
    const chainCount = new Map<string, number>();
    for (const diff of file.diffs) {
      if (diff.managersRaw) {
        const chainKey = diff.managersRaw;
        chainCount.set(chainKey, (chainCount.get(chainKey) ?? 0) + 1);
      }
    }
    if (chainCount.size) {
      const sortedChains = [...chainCount.entries()].sort((a, b) => (b[1] - a[1]));
      diffManagersRaw = sortedChains[0][0];
    }
    if (!matchTextFilter('/' + diffManagersRaw + '/', diffManagerFilter)) {
      continue;
    }
    if (!matchTextFilter('/' + file.managersRaw + '/', caManagerFilter)) {
      continue
    }
    const diffs: DiffEntry[] = []
    for (const diff of file.diffs) {
      if (!diff.matched) {
        continue;
      }
      diffs.push(diff)
    }
    if (!diffs.length) {
      continue
    }
    filteredFiles.push({
      file: file,
      stats: {... file.stats, fileUpdates: diffs.length},
      datas: {... file.datas},
      diffs: diffs,
      diffManagersRaw,
    })
  }
  // Make the second pass of filtering and stat/data calculations.
  for (const filteredFile of filteredFiles.values()) {
    const {stats, datas, diffs} = filteredFile;
    const authors = new Set<string>();
    for (const diff of diffs) {
      authors.add(diff.author);
    }
    datas.authors = authors.size;
    if (fileEvalFilter) {
      if (!fileEvalFilter(stats, datas)) {
        filteredFile.file = null;
        continue;
      }
    }
    // We're keeping this file. Record it in the diffs.
    for (const diff of diffs) {
      diff.filteredFileCount++;
    }
  }
  // Create the file entry tree and propagate stats.
  let totalWeight = 0
  let nextKey = 100
  const root: FileEntry = {
    key: nextKey++,
    name: 'Root',
    managersByDiff: [],
    managersByPath: [],
    stats: {},
    datas: {},
    parent: null,
    children: new Map(),
    diffs: [],
    parsedFile: null
  }
  for (const filteredFile of filteredFiles.values()) {
    const {file, stats, datas, diffs, diffManagersRaw} = filteredFile;
    if (!file) {
      continue;
    }
    let fileUpdatesWeighed = 0;
    for (const diff of diffs) {
      fileUpdatesWeighed += (1 / diff.filteredFileCount);
    }
    stats.fileUpdatesWeighed = fileUpdatesWeighed;
    const baseWeight = toNumberOrZero(stats[filters.weightStat]);
    stats.weight = Math.min(baseWeight, toNumberOrZero(filters.weightCap));
    // Add the file and path parents to the tree.
    totalWeight += stats.weight
    let parent = root
    accumulateStats(root, stats)
    // Shedding zuck etc. above VP, e.g. rish/prashant/nam/lars etc.
    const managersByPath = file.managersRaw.split('/').slice(3);
    const managersByDiff = diffManagersRaw.split('/').slice(3);
    addManagers(root.managersByDiff, managersByDiff)
    addManagers(root.managersByPath, managersByPath)
    let leafEntry: FileEntry | null = null
    for (let i = 0; i < file.pathParts.length; i++) {
      const leaf = i == file.pathParts.length - 1
      const part = file.pathParts[i]
      let fileEntry = parent.children.get(part)
      if (!fileEntry) {
        fileEntry = {
          key: nextKey++,
          name: part,
          managersByDiff: [],
          managersByPath: [],
          stats: { ...stats },
          datas: leaf ? datas : {},
          children: new Map(),
          parent,
          diffs: leaf ? diffs : [],
          parsedFile: null
        }
        parent.children.set(part, fileEntry)
        if (leaf) {
          leafEntry = fileEntry
          leafEntry.parsedFile = file
          file.file = leafEntry
        }
      } else {
        accumulateStats(fileEntry, stats)
      }
      // Make sure managers get added to a new file entry or parent directory.
      addManagers(fileEntry.managersByDiff, managersByDiff)
      addManagers(fileEntry.managersByPath, managersByPath)
      parent = fileEntry
    }
    // Bubble up diffs - but keep it to a few for each level.
    if (leafEntry) {
      for (const diff of leafEntry.diffs) {
        let inserted = false;
        for (let nextParent = leafEntry.parent; nextParent != null; nextParent = nextParent.parent) {
          const insertedInThisParent = insertDiff(nextParent.diffs, WorkConsts.maxDiffPeek + 1, diff);
          inserted ||= insertedInThisParent;
          // If we could not insert in this parent, its parent's will also
          // already have more recent diffs.
          if (!insertedInThisParent) {
            break;
          }
        }
        // Diffs are sorted in descending time order. If we could not bubble up
        // this diff, we won't be able to bubble up the others after this.
        if (!inserted) {
          break;
        }
      }
    }
  }
  const buildContext = {
    runningWeight: 0,
    profile: new CallTreeProfileBuilder(totalWeight),
  }
  // Make sure root will have some weight if nothing matched the filters.
  if (!root.children.size) {
    root.name = 'Nothing matched filters!';
    root.stats.weight = 1;
  }
  addToProfile(buildContext, root)
  const builtProfile = buildContext.profile.build()
  return {
    name: 'Work ' + fileName,
    indexToView: 0,
    profiles: [builtProfile],
  }
}

function insertDiff(diffs: DiffEntry[], maxDiffs: number, diff: DiffEntry): boolean {
  // We are keeping diffs sorted in descending order by date closed.
  let targetIndex = Math.min(diffs.length, maxDiffs);
  // Find the location, bubbling up from the end.
  for (; targetIndex > 0; targetIndex--) {
    const prevDiff = diffs[targetIndex - 1];
    if (prevDiff.dateClosed == diff.dateClosed) {
      if (diffs.includes(diff)) {
        // Don't allow duplicates. Note multiple diffs may have same exact dateClosed.
        return false;
      }
    }
    // Check against the previous element - if it is more recent, we are not
    // going past it.
    if (prevDiff.dateClosed >= diff.dateClosed) {
      break;
    }
  }
  // Are we going to insert?
  if (targetIndex >= maxDiffs) {
    return false;
  }
  // Just append if we are inserting at end.
  if (diffs.length <= targetIndex) {
    diffs.push(diff);
  } else {
    // Splice it in.
    diffs.splice(targetIndex, 0, diff);
    // Pop at the end to keep the limit.
    if (diffs.length > maxDiffs) {
      diffs.pop();
    }
  }
  return true;
}

export function typedKeys<T extends Object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>
}

export type RenderTarget = 'tooltip' | 'details'
type Renderer = (fileEntry: FileEntry, target: RenderTarget) => h.JSX.Element
let rendererImpl: Renderer = () => <div></div>
export function setRendererImpl(impl: Renderer) {
  rendererImpl = impl
}

function renderDetails(fileEntry: FileEntry): h.JSX.Element {
  return rendererImpl(fileEntry, 'details')
}

function renderTooltip(fileEntry: FileEntry): h.JSX.Element {
  return rendererImpl(fileEntry, 'tooltip')
}

function addToProfile(context: BuildContext, fileEntry: FileEntry): void {
  const frameInfo: FrameInfo = {
    key: fileEntry.key,
    name: fileEntry.name,
    data: {
      renderTooltip: () => renderTooltip(fileEntry),
      renderDetails: () => renderDetails(fileEntry),
    },
  }
  context.profile.enterFrame(frameInfo, context.runningWeight)
  if (fileEntry.children.size) {
    const children = [...fileEntry.children.entries()].sort((a, b) => nonLocaleCompare(a[0], b[0]))
    for (const child of children) {
      addToProfile(context, child[1])
    }
  } else {
    context.runningWeight += fileEntry.stats.weight
  }
  context.profile.leaveFrame(frameInfo, context.runningWeight)
}

function accumulateStats(fileEntry: FileEntry, stats: Stats) {
  for (const stat of typedKeys(stats)) {
    fileEntry.stats[stat] = stats[stat] + (fileEntry.stats[stat] ?? 0)
  }
}

function addManagers(addTo: string[][], managers: string[]) {
  for (let i = 0; i < managers.length; i++) {
    let addToLevel: string[]
    if (addTo.length < i + 1) {
      addToLevel = []
      addTo.push(addToLevel)
    } else {
      addToLevel = addTo[i]
    }
    const manager = managers[i]
    if (addToLevel.indexOf(manager) < 0) {
      addToLevel.push(manager)
    }
  }
}

export function getManagers(managers: string[][]): string {
  const allLevels = []
  for (const level of managers) {
    if (level.length == 1) {
      allLevels.push(level[0])
    } else {
      allLevels.push('[' + level.sort().join(',') + ']')
    }
  }
  return allLevels.join('::')
}

export function getPath(fileEntry: FileEntry): string {
  if (fileEntry.parsedFile) {
    return getPathFromParsedFile(fileEntry.parsedFile);
  }
  const parts = []
  for (let current: FileEntry | null = fileEntry; current; current = current.parent) {
    parts.push(current.name)
  }
  return parts.reverse().join('/')
}

export function getPathFromParsedFile(file: ParsedFileEntry): string {
  return 'Root' + file.pathRaw.slice(0, -1);
}

export function getLink(path: string): string {
  const pathParts = path.split('/');
  // Drop the Root and repo from the path.
  const pathForUrl = pathParts.slice(2).join('/');
  const repo = pathParts[1];
  if (repo === 'other') {
    const gkMatch = path.match(/\/gatekeepers.*\/([^/]+).gatekeeper\.[^/]+$/);
    if (gkMatch) {
      return 'https://www.internalfb.com/intern/gatekeeper/history/?projects[0]=' + gkMatch[1];
    }
    const svMatch = path.match(/\/sitevars.*\/([^/]+).sitevar\.[^/]+$/);
    if (svMatch) {
      return 'https://www.internalfb.com/intern/sv/changelog/' + svMatch[1];
    }
  }
  let repoForUrl = getRepoUrlPart(repo, path);
  if (repoForUrl === '') {
    return 'about:blank';
  }
  return ['https://www.internalfb.com/code', repoForUrl, pathForUrl].join('/');
}

function getRepoUrlPart(repo: string, path: string) {
  const fbsourcePrefix = 'fbsource/[history]';
  if (repo === 'other') {
    let configMatch = path.match(/\.cconf$/);
    if (!configMatch) {
      configMatch = path.match(/\.materialized_JSON$/);
    }
    if (configMatch) {
      return 'configerator/[history]';
    }
  }
  switch (repo) {
    case 'www':
    case 'www-other':
      return 'www/[history]';
      break;
    case 'fbandroid':
      return fbsourcePrefix + '/fbandroid';
      break;
    case 'fbcode':
      return fbsourcePrefix + '/fbcode';
      break;
    case 'fbobjc':
      return fbsourcePrefix + '/fbobjc';
      break;
    case 'igsrv':
      if (path.includes('fbcode/instagram-server')) {
        return fbsourcePrefix;
      }
      return 'instagram/[history]';
      break;
    case 'fbsource-other':
      return fbsourcePrefix;
      break;
    case 'xplat':
      return fbsourcePrefix + '/xplat';
      break;
    default:
      return '';
  }
}


function nonLocaleCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export type TL = {
  unixname: string
  tags: string
}

export type ManualTag = {
  type: string
  id: string
  tags: string[]
}

export type Filters = {
  diffManagersInclude?: string
  diffManagersExclude?: string
  caManagersInclude?: string
  caManagersExclude?: string
  pathInclude?: string
  pathExclude?: string
  tagsInclude?: string
  tagsExclude?: string
  authorsInclude?: string
  authorsExclude?: string
  reviewersInclude?: string
  reviewersExclude?: string
  titleInclude?: string
  titleExclude?: string
  diffDateMin?: string
  diffDateMax?: string
  taskTitleInclude?: string
  taskTitleExclude?: string
  taskSev?: boolean
  taskSla?: boolean
  taskLaunchBlocking?: boolean
  taskPriUbn?: boolean
  taskPriHigh?: boolean
  taskPriMid?: boolean
  taskPriLow?: boolean
  taskPriWish?: boolean
  taskPriNone?: boolean
  taskPriAny?: boolean
  fileEvalFilter?: string
  TLs?: TL[]
  tlTagInclude?: string
  tlTagExclude?: string
  tlLanded?: boolean
  tlCommented?: boolean
  tlApproved?: boolean
  notTLLanded?: boolean
  notTLCommented?: boolean
  notTLApproved?: boolean
  manualTags?: ManualTag[]
  manualTagsInclude?: string
  manualTagsExclude?: string
  weightStat: string
  weightCap: string
}

export const defaultFilter: Filters = { weightStat: 'fileUpdatesWeighed', weightCap: '1000' };
let activeFilters: Filters = { ...defaultFilter }

export function getActiveFilters(): Filters {
  return activeFilters
}

export function setActiveFilters(filters: Filters) {
  activeFilters = { ...filters }
}

type TextFilter = {
  includes: Array<string>
  includesRegex: Array<RegExp>
  excludes: Array<string>
  excludesRegex: Array<RegExp>
}

function inputToFilterArray(input: string | undefined): [Array<string>, Array<RegExp>] {
  if (!input) {
    return [[], []]
  }
  let patterns = input.split(' ')
  // Filter out zero length patterns
  patterns = patterns.filter(v => v.length != 0).map(e => e.toLocaleLowerCase())
  const textPatterns: Array<string> = [];
  const regexPatterns: Array<RegExp> = [];
  for (const pattern of patterns) {
    if (isAlphaNumeric(pattern)) {
      textPatterns.push(pattern);
      continue;
    }
    try {
      regexPatterns.push(new RegExp(pattern));
    } catch {
      console.error('Ignoring bad regexp for filter: ' + pattern);
    }
  }
  return [textPatterns, regexPatterns]
}

function buildTextFilter(
  includesInput: string | undefined,
  excludesInput: string | undefined,
): TextFilter {
  const [includes, includesRegex] = inputToFilterArray(includesInput)
  const [excludes, excludesRegex] = inputToFilterArray(excludesInput)
  return { excludes, excludesRegex, includes, includesRegex }
}

function buildEvalFilter(param1: string, param2: string, evalInput: string | undefined) {
  if (!evalInput) {
    return undefined;
  }
  try {
    return new Function(param1, param2, 'return ' + evalInput);
  } catch (err) {
    return () => false;
  }
}

function matchTextFilter(key: string, filters: TextFilter) {
  const keylc = key.toLowerCase()
  // If there are includes, key must match at least one.
  if (filters.includes.length || filters.includesRegex.length) {
    let matched = false
    for (const pattern of filters.includes) {
      if (keylc.includes(pattern)) {
        matched = true
        break
      }
    }
    if (!matched) {
      for (const pattern of filters.includesRegex) {
        if (keylc.search(pattern) >= 0) {
          matched = true
          break
        }
      }
    }
    if (!matched) {
      return false
    }
  }
  // Check for excludes.
  for (const pattern of filters.excludes) {
    if (keylc.includes(pattern)) {
      return false
    }
  }
  for (const pattern of filters.excludesRegex) {
    if (keylc.search(pattern) >= 0) {
      return false
    }
  }
  return true
}

function matchArrayToTextFilter(keys: string[], filters: TextFilter) {
  if (!filters.includes.length &&
    !filters.includesRegex.length &&
    !filters.excludes.length &&
    !filters.excludesRegex.length) {
    return true
  }
  const joined = '/' + keys.join('/') + '/'
  return matchTextFilter(joined, filters)
}

function matchSetToTextFilter(keys: Set<string>, filters: TextFilter) {
  if (!filters.includes.length &&
    !filters.includesRegex.length &&
    !filters.excludes.length &&
    !filters.excludesRegex.length) {
    return true
  }
  return matchArrayToTextFilter([...keys], filters)
}

function trimEnd(str: string) {
  // @ts-ignore TS2550 trimEnd requires es2019
  return str.trimEnd()
}

function dateFilterToEpoch(dateStr: string | undefined, secondsToAdd: number): number | null {
  if (!dateStr) {
    return null
  }
  const fields = dateStr.split('/')
  if (fields.length != 3) {
    return null
  }
  // From local time.
  const date = new Date(`20${fields[0]}-${fields[1]}-${fields[2]}T00:00:00`)
  // Check for valid date...
  if (!date.getTime()) {
    return null
  }
  date.setSeconds(date.getSeconds() + secondsToAdd)
  return date.getTime() / 1000
}

function toNumberOrZero(x: any) {
  const num = Number(x);
  return num ? num : 0;
}

function isAlphaNumeric(str: string) {
  var code, i, len;
  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
      !(code > 64 && code < 91) && // upper alpha (A-Z)
      !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
};

function buildPriorityFilter(filters: Filters): Set<number> {
  const priFilter = new Set<number>();
  if (filters.taskPriNone || filters.taskPriAny) {
    priFilter.add(0);
  }
  if (filters.taskPriUbn || filters.taskPriAny) {
    priFilter.add(1);
  }
  if (filters.taskPriHigh || filters.taskPriAny) {
    priFilter.add(2);
  }
  if (filters.taskPriMid || filters.taskPriAny) {
    priFilter.add(3);
  }
  if (filters.taskPriLow || filters.taskPriAny) {
    priFilter.add(4);
  }
  if (filters.taskPriWish || filters.taskPriAny) {
    priFilter.add(5);
  }
  return priFilter;
}

function matchPriorityFilter(taskPris: Set<number>, priFilter: Set<number>) {
  // No priority filters specified - matches true even if there are no tasks.
  if (!priFilter.size) {
    return true;
  }
  // Note if priority filter is specified, we won't match diffs with no tasks.
  for (const taskPriority of taskPris) {
    if (priFilter.has(taskPriority)) {
      return true;
    }
  }
  return false;
}

export function isSlaTask(task: TaskEntry): boolean {
  return task.is_sla;
}

export function isSevTask(task: TaskEntry): boolean {
  return task.tags.has('SEV Task');
}

export function isLaunchBlockingTask(task: TaskEntry): boolean {
  return task.tags.has('launch-blocking');
}

export function getTaskPriorityName(priority: number) {
  switch (priority) {
    case 0:
      return 'none';
    case 1:
      return 'ubn';
    case 2:
      return 'high';
    case 3:
      return 'mid';
    case 4:
      return 'low';
    case 5:
      return 'wish';
    default:
      return 'unknown';
  }
}

export function compareTaskPriority(a: number, b: number) {
  if (a == b) {
    return 0;
  }
  if (a == 0) {
    return -1;
  }
  if (b == 0) {
    return 1;
  }
  if (a > b) {
    return -1;
  }
  return 1;
}
