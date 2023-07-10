
import { h } from 'preact'
import { useCallback, useRef, useState } from 'preact/hooks'
import { StyleSheet, css } from 'aphrodite'
import { Sizes } from './style'
import { useTheme, withTheme } from './themes/theme'
import {
  FileEntry,
  getManagers,
  getPath,
  typedKeys,
  setRendererImpl,
  RenderTarget,
  Filters,
  getActiveFilters,
  setActiveFilters,
} from '../import/worktrack'

export interface FilterViewProps {
  reloadLastProfile(): void
  close(): void
}

export function FilterView(props: FilterViewProps) {
  const style = getStyle(useTheme());
  const filters = getActiveFilters();
  const applyFilter = useCallback(() => {
    setActiveFilters(filters);
    props.close();
    props.reloadLastProfile();
  }, [props, filters]);
  const resetFilter = useCallback(() => {
    setActiveFilters({});
    props.close();
    props.reloadLastProfile();
  }, [props]);
  const inputToField = (field: string) => {
    return (ev: Event) => {
      filters[field] = (ev.target as HTMLInputElement).value;
    }
  };
  const checkboxToField = (field: string) => {
    return (ev: Event) => {
      filters[field] = (ev.target as HTMLInputElement).checked;
    }
  };

  return (
    <div className={css(style.filterView)}>
      <div className={css(style.filterViewRow)}>
        <span>Manager:</span>
        <span>Include:</span>
        <input type="text" value={filters.managersInclude} onInput={inputToField('managersInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.managersExclude} onInput={inputToField('managersExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Path:</span>
        <span>Include:</span>
        <input type="text" value={filters.pathInclude} onInput={inputToField('pathInclude')} />
        <span>Exclude:</span>
        <input type="text" value={filters.pathExclude} onInput={inputToField('pathExclude')} />
      </div>
      <div className={css(style.filterViewRow)}>
        <span>Task Tags</span>
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
        <input type="checkbox" checked={filters.taskPriUbn} onInput={checkboxToField('taskPriUbn')} />
        <span>UBN</span>
        <input type="checkbox" checked={filters.taskPriHigh} onInput={checkboxToField('taskPriHigh')} />
        <span>High</span>
        <input type="checkbox" checked={filters.taskPriMid} onInput={checkboxToField('taskPriMid')} />
        <span>Mid</span>
        <input type="checkbox" checked={filters.taskPriLow} onInput={checkboxToField('taskPriLow')} />
        <span>Low</span>
        <input type="checkbox" checked={filters.taskPriWish} onInput={checkboxToField('taskPriWish')} />
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
  const { fileEntry, target } = props;
  const rows: h.JSX.Element[] = []
  for (const statName of typedKeys(fileEntry.stats)) {
    if (statName === 'weight') {
      continue;
    }
    rows.push(<p><b>{statName + ':'}</b>{fileEntry.stats[statName]}</p>);
  }
  return (
    <div>
      {target === 'details' ? (<p>{getPath(fileEntry)}</p>) : undefined}
      <p>{getManagers(fileEntry.managers)}</p>
      {rows}
    </div>
  );
}

function renderEntry(fileEntry: FileEntry, target: RenderTarget): h.JSX.Element {
  return <EntryView fileEntry={fileEntry} target={target} />;
}

setRendererImpl(renderEntry);

const getStyle = withTheme(theme =>
  StyleSheet.create({
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
