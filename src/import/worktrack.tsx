import {ProfileGroup, FrameInfo, CallTreeProfileBuilder} from '../lib/profile'
import {TextFileContent} from './utils'

import {h} from 'preact'

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
  tasks: TaskEntry[]
}

export type TaskEntry = {
  id: number
  title: string
  priority: number
  taskType: number
  tags: Set<string>
}

type ParsedFileEntry = {
  managersRaw: string
  managers: string[]
  pathRaw: string
  pathParts: string[]
  diffs: DiffEntry[]
  stats: Stats
  datas: Datas
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
  managers: string[][]
  stats: Stats
  datas: Datas
  children: Map<string, FileEntry>
  parent: FileEntry | null
  diffs: DiffEntry[]
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
      tasks: [],
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
    const tags = fields[fieldCount++].split(':::')
    const task: TaskEntry = {
      id: taskId,
      title,
      priority,
      taskType,
      tags,
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
    const vpFound = managersRaw.indexOf('ritandon')
    if (vpFound >= 0) {
      managersRaw = managersRaw.substring(vpFound)
    }
    const managers = managersRaw.split('/')
    const diffFbids = fields[fieldCount++].split('/')
    const repo = fields[fieldCount++]
    let path = fields[fieldCount++]
    const repoPrefix = repo + '/'
    if (!path.startsWith(repoPrefix)) {
      path = repoPrefix + path
    }
    const diffs: DiffEntry[] = []
    const fileTags = new Set<string>()
    for (const diffFbid of diffFbids) {
      const diff = workContent.diffs.get(diffFbid)
      if (diff) {
        diffs.push(diff)
        for (const task of diff.tasks) {
          for (const tag of task.tags.keys()) {
            fileTags.add(tag)
          }
        }
      }
    }
    if (!diffs.length) {
      // Warn if no diffs even if no filters and ...
      console.warn(`${path} has no diffs with details ${diffFbids}`)
      continue
    }
    const pathParts = path.split('/')
    const logicalComplexity = Number(fields[fieldCount++])
    const codeCoveragePercent = Number(fields[fieldCount++])
    const userActiveCgtDaysL180 = Number(fields[fieldCount++])
    const userActivePreDiffCgtDaysL180 = Number(fields[fieldCount++])
    const editCount = Number(fields[fieldCount++])
    const ploc = Number(fields[fieldCount++])
    const stats: Stats = {
      fileCount: 1,
      editCountL180: editCount,
      ploc,
    }
    const datas: Datas = {
      logicalComplexity,
      codeCoveragePercent,
      userActiveCgtDaysL180,
      userActivePreDiffCgtDaysL180,
    }
    const file: ParsedFileEntry = {
      managers,
      managersRaw: '/' + managersRaw + '/',
      pathParts,
      pathRaw: '/' + path + '/',
      diffs,
      stats,
      datas,
    }
    workContent.files.push(file)
  }
  // Stitch together diffs and tasks.
  for (const diff of workContent.diffs.values()) {
    for (const taskId of diff.taskIds) {
      const task = workContent.tasks.get(taskId)
      if (!task) {
        console.warn(`Missing task T${taskId} for diff D${diff.id}`)
        continue
      }
      diff.tasks.push(task)
    }
  }
  fileWithWorkContent.workContent = workContent
  return workContent
}

export function importWorkTrack(contents: TextFileContent, fileName: string): ProfileGroup {
  const parsedData = parseWorkContent(contents)
  const filters = getActiveFilters()
  const managerFilter = buildTextFilter(filters.managersInclude, filters.managersExclude)
  const pathFilter = buildTextFilter(filters.pathInclude, filters.pathExclude)
  const authorFilter = buildTextFilter(filters.authorsInclude, filters.authorsExclude)
  const titleFilter = buildTextFilter(filters.titleInclude, filters.titleExclude)
  const tagFilter = buildTextFilter(filters.tagsInclude, filters.tagsExclude)
  const dateMin = dateFilterToEpoch(filters.diffDateMin, 0)
  const dateMax = dateFilterToEpoch(filters.diffDateMax, 24 * 60 * 60)
  let totalWeight = 0
  let nextKey = 100
  const root: FileEntry = {
    key: nextKey++,
    name: 'Root',
    managers: [],
    stats: {},
    datas: {},
    parent: null,
    children: new Map(),
    diffs: [],
  }
  for (const file of parsedData.files) {
    if (!matchTextFilter(file.managersRaw, managerFilter)) {
      continue
    }
    if (!matchTextFilter(file.pathRaw, pathFilter)) {
      continue
    }
    const diffs: DiffEntry[] = []
    const fileTags = new Set<string>()
    for (const diff of file.diffs) {
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
      if (!matchTextFilter(diff.title, titleFilter)) {
        continue
      }
      diffs.push(diff)
      for (const task of diff.tasks) {
        for (const tag of task.tags.keys()) {
          fileTags.add(tag)
        }
      }
    }
    if (!diffs.length) {
      continue
    }
    // Apply tag filter.
    if (!matchSetToTextFilter(fileTags, tagFilter)) {
      continue
    }
    // TODO: Make the weight configurable.
    const stats = {...file.stats, weight: Math.min(file.stats.editCountL180, 10)}
    // Add the file and path parents to the tree.
    totalWeight += stats.weight
    let parent = root
    accumulateStats(root, stats)
    addManagers(root.managers, file.managers)
    let leafEntry: FileEntry | null = null
    for (let i = 0; i < file.pathParts.length; i++) {
      const leaf = i == file.pathParts.length - 1
      const part = file.pathParts[i]
      let fileEntry = parent.children.get(part)
      if (!fileEntry) {
        fileEntry = {
          key: nextKey++,
          name: part,
          managers: [],
          // Make weight configurable
          stats: {...stats},
          datas: leaf ? file.datas : {},
          children: new Map(),
          parent,
          diffs: leaf ? diffs : [],
        }
        parent.children.set(part, fileEntry)
        if (leaf) {
          leafEntry = fileEntry
        }
      } else {
        accumulateStats(fileEntry, stats)
      }
      // Make sure managers get added to a new file entry or parent directory.
      addManagers(fileEntry.managers, file.managers)
      parent = fileEntry
    }
    // Bubble up diffs - but keep it to a few for each level.
    if (leafEntry) {
      for (let nextParent = leafEntry.parent; nextParent != null; nextParent = nextParent.parent) {
        if (nextParent.diffs.length >= WorkConsts.maxDiffPeek + 1) {
          break
        }
        for (const diff of leafEntry.diffs) {
          if (!nextParent.diffs.includes(diff)) {
            nextParent.diffs.push(diff)
            if (nextParent.diffs.length >= WorkConsts.maxDiffPeek + 1) {
              break
            }
          }
        }
      }
    }
  }
  const buildContext = {
    runningWeight: 0,
    profile: new CallTreeProfileBuilder(totalWeight),
  }
  addToProfile(buildContext, root)
  const builtProfile = buildContext.profile.build()
  return {
    name: 'Work ' + fileName,
    indexToView: 0,
    profiles: [builtProfile],
  }
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
  fileEntry.diffs.sort((a, b) => b.dateClosed - a.dateClosed)
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
  const parts = []
  for (let current: FileEntry | null = fileEntry; current; current = current.parent) {
    parts.push(current.name)
  }
  return parts.reverse().join('/')
}

function nonLocaleCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export type Filters = {
  managersInclude?: string
  managersExclude?: string
  pathInclude?: string
  pathExclude?: string
  tagsInclude?: string
  tagsExclude?: string
  authorsInclude?: string
  authorsExclude?: string
  titleInclude?: string
  titleExclude?: string
  diffDateMin?: string
  diffDateMax?: string
  taskSev?: boolean
  taskSla?: boolean
  taskPriUbn?: boolean
  taskPriHigh?: boolean
  taskPriMid?: boolean
  taskPriLow?: boolean
  taskPriWish?: boolean
}

let activeFilters: Filters = {}

export function getActiveFilters(): Filters {
  return activeFilters
}

export function setActiveFilters(filters: Filters) {
  activeFilters = filters
}

type TextFilter = {
  includes: Array<string>
  excludes: Array<string>
}

function inputToFilterArray(input: string | undefined) {
  if (!input) {
    return []
  }
  const patterns = input.split(' ')
  // Filter out zero length patterns
  return patterns.filter(v => v.length != 0).map(e => e.toLocaleLowerCase())
}

function buildTextFilter(
  includesInput: string | undefined,
  excludesInput: string | undefined,
): TextFilter {
  const includes = inputToFilterArray(includesInput)
  const excludes = inputToFilterArray(excludesInput)
  return {excludes, includes}
}

function matchTextFilter(key: string, filters: TextFilter) {
  const keylc = key.toLowerCase()
  // If there are includes, key must match at least one.
  if (filters.includes.length) {
    let matched = false
    for (const pattern of filters.includes) {
      if (keylc.includes(pattern)) {
        matched = true
        break
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
  return true
}

function matchArrayToTextFilter(keys: string[], filters: TextFilter) {
  if (!filters.includes.length && !filters.excludes.length) {
    return true
  }
  const joined = '/' + keys.join('/') + '/'
  return matchTextFilter(joined, filters)
}

function matchSetToTextFilter(keys: Set<string>, filters: TextFilter) {
  if (!filters.includes.length && !filters.excludes.length) {
    return true
  }
  return matchArrayToTextFilter([...keys.values()], filters)
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
