import {h} from 'preact'
import {useCallback} from 'preact/hooks'
import {StyleSheet, css} from 'aphrodite'
import {Sizes} from './style'
import {useTheme, withTheme} from './themes/theme'
import {
  FileEntry,
  getManagers,
  getPath,
  typedKeys,
  setRendererImpl,
  RenderTarget,
  getActiveFilters,
  setActiveFilters,
  DiffEntry,
  WorkConsts,
} from '../import/worktrack'

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
    setActiveFilters({})
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
        <span>Manager:</span>
        <span>Include:</span>
        <input
          type="text"
          value={filters.managersInclude}
          onInput={inputToField('managersInclude')}
        />
        <span>Exclude:</span>
        <input
          type="text"
          value={filters.managersExclude}
          onInput={inputToField('managersExclude')}
        />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Path:</span>
        <span>Include:</span>
        <input type="text" value={filters.pathInclude} onInput={inputToField('pathInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.pathExclude} onInput={inputToField('pathExclude')} />
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
        <span>Task Tags:</span>
        <span>Include:</span>
        <input type="text" value={filters.tagsInclude} onInput={inputToField('tagsInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.tagsExclude} onInput={inputToField('tagsExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Task:</span>
        <input type="checkbox" checked={filters.taskSev} onInput={checkboxToField('taskSev')} />
        <span>SEV</span>
        <input type="checkbox" checked={filters.taskSla} onInput={checkboxToField('taskSla')} />
        <span>SLA</span>
        <span>Priority:</span>
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

export function EntryView(props: EntryViewProps): h.JSX.Element {
  const style = getStyle(useTheme())
  const {fileEntry, target} = props
  const detailsView = target === 'details'
  const rows: h.JSX.Element[] = []
  let list: h.JSX.Element[] = []
  const diffs = getDiffsForTarget(fileEntry, target)
  rows.push(<p>Diffs:</p>)
  list = []
  for (const diff of diffs) {
    const dateClosed = toMonthDate(new Date(1000 * diff.dateClosed))
    list.push(
      <li>
        <a href={`https://www.internalfb.com/diff/D${diff.id}`}>{'D' + diff.id}</a>
        {' ' + diff.author} {dateClosed} {diff.title} [{diff.fileCount}/{diff.extensions.join(',')}]
      </li>,
    )
    if (!detailsView && list.length >= WorkConsts.maxDiffPeek) {
      list.push(<li>...</li>)
      break
    }
  }
  rows.push(<ul className={css(style.bulletlist)}>{list}</ul>)
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
  return (
    <div className={css(style.container)}>
      {detailsView ? <p>{getPath(fileEntry)}</p> : undefined}
      <p>{getManagers(fileEntry.managers)}</p>
      {rows}
    </div>
  )
}

function getDiffsForTarget(fileEntry: FileEntry, target: RenderTarget): DiffEntry[] {
  if (target !== 'details') {
    return fileEntry.diffs
  }
  const collected = [...collectDiffs(fileEntry, 100, new Set())]
  collected.sort((a, b) => b.dateClosed - a.dateClosed)
  return collected
}

function collectDiffs(fileEntry: FileEntry, max: number, diffs: Set<DiffEntry>) {
  if (!fileEntry.children.size) {
    for (const diff of fileEntry.diffs) {
      diffs.add(diff)
      if (diffs.size >= max) {
        break
      }
    }
  } else {
    for (const child of fileEntry.children.values()) {
      collectDiffs(child, max, diffs)
      if (diffs.size >= max) {
        break
      }
    }
  }
  return diffs
}

function renderEntry(fileEntry: FileEntry, target: RenderTarget): h.JSX.Element {
  return <EntryView fileEntry={fileEntry} target={target} />
}

function toMonthDate(date: Date) {
  return date.toISOString().substring(5, 10)
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
  }),
)
