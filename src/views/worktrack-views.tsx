import { h, ComponentChildren } from 'preact'
import { useCallback, useMemo, useState } from 'preact/hooks'
import { StyleSheet, css } from 'aphrodite'
import { Duration, Sizes } from './style'
import { useTheme, withTheme } from './themes/theme'
import {
  FileEntry,
  ParsedFileEntry,
  getManagers,
  getLink,
  getPath,
  getPathFromParsedFile,
  typedKeys,
  setRendererImpl,
  RenderTarget,
  defaultFilter,
  getActiveFilters,
  setActiveFilters,
  getTaskPriorityName,
  compareTaskPriority,
  DiffEntry,
  TaskEntry,
  WorkConsts,
  isSlaTask,
  isSevTask,
  isLaunchBlockingTask,
} from '../import/worktrack'

const maxDiffsToRender = 1000;

export interface FilterViewProps {
  reloadLastProfile(): void
  close(): void
}

export function FilterView(props: FilterViewProps) {
  const style = getStyle(useTheme())
  const filters = getActiveFilters()
  const applyFilter = useCallback(() => {
    setActiveFilters(filters)
    props.close()
    props.reloadLastProfile()
  }, [props, filters])
  const resetFilter = useCallback(() => {
    setActiveFilters(defaultFilter)
    props.close()
    props.reloadLastProfile()
  }, [props])
  const inputToField = (field: string) => {
    return (ev: Event) => {
      // @ts-ignore Make it easier to bind filters fields to input
      filters[field] = (ev.target as HTMLInputElement).value
    }
  }
  const checkboxToField = (field: string) => {
    return (ev: Event) => {
      // @ts-ignore Make it easier to bind filters fields to input
      filters[field] = (ev.target as HTMLInputElement).checked
    }
  }

  return (
    <div className={css(style.filterView)}>
      <div className={css(style.filterViewRow)}>
        <span>Path:</span>
        <span>Include:</span>
        <input type="text" value={filters.pathInclude} onInput={inputToField('pathInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.pathExclude} onInput={inputToField('pathExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Diff Manager:</span>
        <span>Include:</span>
        <input
          type="text"
          value={filters.diffManagersInclude}
          onInput={inputToField('diffManagersInclude')}
        />
        <span>Exclude:</span>
        <input
          type="text"
          value={filters.diffManagersExclude}
          onInput={inputToField('diffManagersExclude')}
        />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Diff Title:</span>
        <span>Include:</span>
        <input type="text" value={filters.titleInclude} onInput={inputToField('titleInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.titleExclude} onInput={inputToField('titleExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Diff Author:</span>
        <span>Include:</span>
        <input type="text" value={filters.authorsInclude} onInput={inputToField('authorsInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.authorsExclude} onInput={inputToField('authorsExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Diff Reviewers:</span>
        <span>Include:</span>
        <input type="text" value={filters.reviewersInclude} onInput={inputToField('reviewersInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.reviewersExclude} onInput={inputToField('reviewersExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Diff Closed:</span>
        <span>Min YY/MM/DD:</span>
        <input type="text" value={filters.diffDateMin} onInput={inputToField('diffDateMin')} />
        <span>Max YY/MM/DD:</span>
        <input type="text" value={filters.diffDateMax} onInput={inputToField('diffDateMax')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Task Title:</span>
        <span>Include:</span>
        <input type="text" value={filters.taskTitleInclude} onInput={inputToField('taskTitleInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.taskTitleExclude} onInput={inputToField('taskTitleExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Task Tags:</span>
        <span>Include:</span>
        <input type="text" value={filters.tagsInclude} onInput={inputToField('tagsInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.tagsExclude} onInput={inputToField('tagsExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Weight stat:</span>
        <input type="text" value={filters.weightStat} onInput={inputToField('weightStat')} />
        <span>Weight cap:</span>
        <input type="text" value={filters.weightCap} onInput={inputToField('weightCap')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Code Asset Manager:</span>
        <span>Include:</span>
        <input
          type="text"
          value={filters.caManagersInclude}
          onInput={inputToField('caManagersInclude')}
        />
        <span>Exclude:</span>
        <input
          type="text"
          value={filters.caManagersExclude}
          onInput={inputToField('caManagersExclude')}
        />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Task Priority:</span>
        <input
          type="checkbox"
          checked={filters.taskPriAny}
          onInput={checkboxToField('taskPriAny')}
        />
        <span>Any</span>
        <input
          type="checkbox"
          checked={filters.taskPriUbn}
          onInput={checkboxToField('taskPriUbn')}
        />
        <span>UBN</span>
        <input
          type="checkbox"
          checked={filters.taskPriHigh}
          onInput={checkboxToField('taskPriHigh')}
        />
        <span>High</span>
        <input
          type="checkbox"
          checked={filters.taskPriMid}
          onInput={checkboxToField('taskPriMid')}
        />
        <span>Mid</span>
        <input
          type="checkbox"
          checked={filters.taskPriLow}
          onInput={checkboxToField('taskPriLow')}
        />
        <span>Low</span>
        <input
          type="checkbox"
          checked={filters.taskPriWish}
          onInput={checkboxToField('taskPriWish')}
        />
        <span>Wish</span>
        <input
          type="checkbox"
          checked={filters.taskPriNone}
          onInput={checkboxToField('taskPriNone')}
        />
        <span>None</span>
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Task Category:</span>
        <input type="checkbox" checked={filters.taskSev} onInput={checkboxToField('taskSev')} />
        <span>SEV</span>
        <input type="checkbox" checked={filters.taskSla} onInput={checkboxToField('taskSla')} />
        <span>SLA</span>
        <input type="checkbox" checked={filters.taskLaunchBlocking} onInput={checkboxToField('taskLaunchBlocking')} />
        <span>Launch Blocking</span>
      </div>
      <div className={css(style.filterViewRow)}>
        <button onClick={resetFilter}>Reset</button>
        <button onClick={applyFilter}>Apply</button>
      </div>
    </div>
  )
}

interface EntryViewProps {
  fileEntry: FileEntry
  target: RenderTarget
}

function StatsDatasView(props: EntryViewProps): h.JSX.Element {
  const style = getStyle(useTheme())
  const { fileEntry } = props
  const rows: h.JSX.Element[] = []
  let list: h.JSX.Element[] = []
  rows.push(<p>Stats:</p>)
  list = []
  for (const statName of typedKeys(fileEntry.stats).sort()) {
    if (statName === 'weight') {
      continue
    }
    list.push(
      <li>
        <b>{statName + ':'}</b>
        {fileEntry.stats[statName]}
      </li>,
    )
  }
  rows.push(<ul className={css(style.bulletlist)}>{list}</ul>)
  const dataKeys = typedKeys(fileEntry.datas).sort()
  if (dataKeys.length) {
    rows.push(<p>Datas:</p>)
    list = []
    for (const dataName of dataKeys) {
      list.push(
        <li>
          <b>{dataName + ':'}</b>
          {fileEntry.datas[dataName]}
        </li>,
      )
    }
    rows.push(<ul className={css(style.bulletlist)}>{list}</ul>)
  }
  return <div>{rows}</div>;
}

function DiffsView(props: EntryViewProps): h.JSX.Element {
  const { fileEntry, target } = props
  const [expanded, setExpanded] = useState(true)
  const [startIndex, setStartIndex] = useState(0)
  const rows: h.JSX.Element[] = []
  let list: h.JSX.Element[] = []
  const [diffs, hasMoreDiffs] = useMemo(() => getDiffsForTarget(fileEntry, target), [fileEntry, target]);
  if (startIndex > diffs.length) {
    setStartIndex(0);
  }
  const authors = new Set<string>();
  for (const diff of diffs) {
    authors.add(diff.author);
  }
  const renderDiffs = useMemo(() => diffs.slice(startIndex, startIndex + maxDiffsToRender), [diffs, startIndex]);
  const endIndex = startIndex + renderDiffs.length;
  const lastPage = Math.floor(endIndex / maxDiffsToRender) * maxDiffsToRender;
  const showPaging = renderDiffs.length != diffs.length;
  rows.push(<p><a onClick={() => setExpanded(!expanded)}>
    [{(expanded) ? 'v' : '+'}] Diffs [{diffs.length}{hasMoreDiffs ? '+' : ''}]:{' '}
    {isDetailsView(target) ? '(' + authors.size + ' authors) ': ''}
    </a>
    {(showPaging) ?
      <span style={{'user-select': 'none'}}>
        <a onClick={()=>{setStartIndex(Math.max(0, startIndex - maxDiffsToRender))}}>{'< '}</a>
        Showing {startIndex ? startIndex : '0000'}-{endIndex}
        <a onClick={()=>{setStartIndex(Math.min(lastPage , startIndex + maxDiffsToRender))}}>{' >'}</a>
      </span> : null}
  </p>)
  if (expanded) {
    list = []
    for (const diff of renderDiffs) {
      list.push(
        <DiffLine diff={diff} key={diff.id} />
      )
      if (!isDetailsView(target) && list.length >= WorkConsts.maxDiffPeek) {
        list.push(<p>...</p>)
        break
      }
    }
    rows.push(<div style={{ marginLeft: 10 }}>{list}</div>)
  }
  if (isDetailsView(target)) {
    rows.push(<TasksView diffs={renderDiffs} />);
  }
  return <div>{rows}</div>;
}

interface TasksViewProps {
  diffs: DiffEntry[]
}

function TasksView(props: TasksViewProps): h.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const { diffs } = props
  const rows: h.JSX.Element[] = []
  let list: h.JSX.Element[] = []
  const tasks = new Set<TaskEntry>();
  for (const diff of diffs) {
    for (const task of diff.tasks) {
      tasks.add(task);
    }
  }
  const sortedTasks = [...tasks].sort((a, b) => { return b.id - a.id });
  rows.push(<p><a onClick={() => setExpanded(!expanded)}>
    [{(expanded) ? 'v' : '+'}] Tasks (for diffs shown above) [{tasks.size}]:
  </a></p>)
  if (expanded) {
    list = []
    for (const task of sortedTasks) {
      list.push(
        <TaskLine task={task} key={task.id} />
      )
    }
    rows.push(<div style={{ marginLeft: 10 }}>{list}</div>)
  }
  return <div>{rows}</div>;
}


export function EntryView(props: EntryViewProps): h.JSX.Element {
  const style = getStyle(useTheme())
  const { fileEntry, target } = props
  return (
    <div className={css(style.container)}>
      {isDetailsView(target) ? <NewTabOnlyLink href={getLink(getPath(fileEntry))}>
        {getPath(fileEntry)}
      </NewTabOnlyLink> : undefined}
      <div style={{ whiteSpace: 'nowrap' }}>Team[By Diff]: {getManagers(fileEntry.managersByDiff)}</div>
      <div style={{ whiteSpace: 'nowrap' }}>Team[By CodeAsset]: {getManagers(fileEntry.managersByPath)}</div>
      <DiffsView {...props} />
      <StatsDatasView {...props} />
    </div>
  )
}

interface TaskLineProps {
  task: TaskEntry
}

function mergeTaskCategory(category: Set<string>, task: TaskEntry) {
  if (isLaunchBlockingTask(task)) {
    category.add('LB');
  }
  if (isSevTask(task)) {
    category.add('SEV');
  }
  if (isSlaTask(task)) {
    category.add('SLA');
  }
}

function taskCategoryToString(category: Set<string>) {
  return [...category.keys()].sort().join(' ');
}

function TaskLine(props: TaskLineProps): h.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const { task } = props;
  const category: Set<string> = new Set();
  mergeTaskCategory(category, task);
  let slaInfo: h.JSX.Element | null = null;
  if (isSlaTask(task) && (task.sla_start || task.sla_completion || task.sla_deadline)) {
    slaInfo = (<p>
      {'SLA: '}
      {(task.sla_start ? 'Start: ' + toDateString(task.sla_start) + ' ' : '')}
      {(task.sla_completion ? 'Complete: ' + toDateString(task.sla_completion) + ' ' : '')}
      {(task.sla_deadline ? 'Deadline: ' + toDateString(task.sla_deadline) + ' ' : '')}
    </p>);
  }
  const categoryString = taskCategoryToString(category);
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <a style={{ marginRight: 5 }} onClick={() => setExpanded(!expanded)}>[{(expanded) ? 'v' : '+'}]</a>
      <span>
        <NewTabOnlyLink href={`https://www.internalfb.com/tasks/?t=${task.id}`}>
          {'T' + task.id}
        </NewTabOnlyLink>
        <a style={{ marginLeft: 5, marginRight: 5 }} onClick={() => setExpanded(!expanded)}>
          {categoryString ? categoryString + ' ' : ''}
          [{getTaskPriorityName(task.priority)}]{' '}
          {task.title}
        </a>
      </span>
      {!expanded ? null : (
        <div style={{ marginLeft: 10 }}>
          <p>Tags: {[...task.tags].sort().join(' ')}</p>
          {slaInfo}
        </div>
      )}
    </div>
  );
}

interface FileLineProps {
  file: ParsedFileEntry
}

function FileLine(props: FileLineProps): h.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const { file } = props;
  const path = getPathFromParsedFile(file);
  const displayPath = path.replace(/^Root\//, '')
  const isExpandable = file.file != null;
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <span style={{ marginRight: 5 }}>
        {isExpandable ? (<a onClick={() => setExpanded(!expanded)}>
          {'[' + (expanded ? 'v' : '>') + '] ' + displayPath}</a>) : ('[ ] ')}
        {!isExpandable ? (
          <NewTabOnlyLink href={getLink(path)}>
            {displayPath}
          </NewTabOnlyLink>) : null}
        {isExpandable && expanded ? (
          <div style={{ marginLeft: 10 }}>
            <EntryView fileEntry={file.file!} target='details' />
          </div>) : null}
      </span>
    </div>
  );
}

interface DiffLineProps {
  diff: DiffEntry
}

function DiffLine(props: DiffLineProps): h.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const { diff } = props;
  const dateClosed = toMonthDate(new Date(1000 * diff.dateClosed))
  const taskList: h.JSX.Element[] = [];
  const fileList: h.JSX.Element[] = [];
  const category = new Set<string>();
  let maxPriority = 0;
  for (const task of diff.tasks) {
    mergeTaskCategory(category, task);
    if (compareTaskPriority(maxPriority, task.priority) < 0) {
      maxPriority = task.priority;
    }
  }
  const categoryString = taskCategoryToString(category);
  if (expanded) {
    for (const task of diff.tasks) {
      taskList.push(<TaskLine task={task} key={task.id} />);
    }
    for (const file of diff.parsedFiles) {
      fileList.push(<FileLine file={file} key={file.pathRaw} />);
    }
  }
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <span>
        <a style={{ marginRight: 5 }} onClick={() => setExpanded(!expanded)}>[{diff.tasks.length ? (expanded ? 'v' : '+') : '-'}]</a>
        <NewTabOnlyLink href={`https://www.internalfb.com/diff/D${diff.id}`}>
          {'D' + diff.id}
        </NewTabOnlyLink>
        <a style={{ marginLeft: 5, marginRight: 5 }} onClick={() => setExpanded(!expanded)}>
          {dateClosed}
          {categoryString ? ' ' + categoryString : ''}
          {maxPriority ? ' [' + getTaskPriorityName(maxPriority) + ']' : ''}
        </a>
        <NewTabOnlyLink href={'https://www.internalfb.com/intern/bunny/?q=' + encodeURIComponent('cdiffs ' + diff.author)}>
          {diff.author}
        </NewTabOnlyLink>
        <a style={{ marginLeft: 5, marginRight: 5 }} onClick={() => setExpanded(!expanded)}>
          {diff.title}
          [{diff.fileCount}/{diff.extensions.join(',')}]
          [{diff.reviewers.sort().join(',')}]
        </a>
      </span>
      {(expanded) ? (<div style={{ marginLeft: 10 }}>{taskList}{fileList}</div>) : null}
    </div>
  );
}

function getDiffsForTarget(fileEntry: FileEntry, target: RenderTarget): [DiffEntry[], boolean] {
  if (!isDetailsView(target)) {
    const diffs = fileEntry.diffs;
    const hasMoreDiffs = !!fileEntry.children.size && (diffs.length >= WorkConsts.maxDiffPeek);
    return [diffs, hasMoreDiffs]
  }
  const collected = [...collectDiffs(fileEntry, new Set())]
  collected.sort((a, b) => b.dateClosed - a.dateClosed)
  return [collected, false]
}

function collectDiffs(fileEntry: FileEntry, diffs: Set<DiffEntry>) {
  if (!fileEntry.children.size) {
    for (const diff of fileEntry.diffs) {
      diffs.add(diff)
    }
  } else {
    for (const child of fileEntry.children.values()) {
      collectDiffs(child, diffs)
    }
  }
  return diffs
}

interface LinkProps {
  children: ComponentChildren
  href: string
}

function NewTabOnlyLink(props: LinkProps): h.JSX.Element {
  const style = getStyle(useTheme())
  return (
    <a className={css(style.link)} onClick={preventClickNavigation} href={props.href}>
      {props.children}
    </a>
  )
}

function preventClickNavigation(ev: MouseEvent) {
  if (ev.button == 0 && !ev.ctrlKey && !ev.metaKey) {
    ev.preventDefault();
  }
}

function renderEntry(fileEntry: FileEntry, target: RenderTarget): h.JSX.Element {
  return <EntryView fileEntry={fileEntry} target={target} />
}

function isDetailsView(target: RenderTarget) {
  return target === 'details';
}

function toMonthDate(date: Date) {
  return date.toISOString().substring(5, 10)
}

function toDateString(epoch: number) {
  const iso = new Date(1000 * epoch).toISOString();
  return iso.substring(0, 10);
}

setRendererImpl(renderEntry)

const getStyle = withTheme(theme =>
  StyleSheet.create({
    bulletlist: {
      listStylePosition: 'inside',
      listStyleType: 'disc',
    },
    container: {
      display: 'block',
    },
    filterView: {
      background: theme.altBgSecondaryColor,
      borderWidth: 2,
      borderColor: theme.altFgPrimaryColor,
      borderStyle: 'solid',
      padding: '10px',
      color: theme.altFgPrimaryColor,
      display: 'flex',
      flexDirection: 'column',
      position: 'absolute',
      top: Sizes.TOOLBAR_TAB_HEIGHT,
      left: 10,
      zIndex: 1,
    },
    filterViewRow: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '5px',
      paddingTop: '10px',
    },
    link: {
      color: theme.selectionPrimaryColor,
      cursor: 'pointer',
      textDecoration: 'none',
      transition: `all ${Duration.HOVER_CHANGE} ease-in`,
      ':hover': {
        color: theme.selectionSecondaryColor,
      },
    },
  }),
)
