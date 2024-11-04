// src/App.js
import React, { useRef, useCallback, useState } from 'react';
import { AutoSizer, VariableSizeGrid as Grid, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import Draggable from 'react-draggable';
import 'react-virtualized/styles.css'; // only needs to be imported once

const data = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `Name ${i}`,
  value: `Value ${i}`
}));

const initialColumnWidths = [100, 200, 300]; // Example initial widths for each column

const App = () => {
  const gridRef = useRef(null);
  const cache = useRef(
    new CellMeasurerCache({
      defaultHeight: 35,
      fixedWidth: true,
    })
  );

  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);

  const getColumnWidth = useCallback(({ index }) => columnWidths[index], [columnWidths]);
  const getRowHeight = useCallback(({ index }) => cache.current.rowHeight({ index }), []);

  const handleResize = (index, deltaX) => {
    setColumnWidths(prevWidths => {
      const newWidths = [...prevWidths];
      newWidths[index] = Math.max(newWidths[index] + deltaX, 50); // Minimum width of 50px
      return newWidths;
    });
    cache.current.clearAll();
    gridRef.current.recomputeGridSize();
  };

  const cellRenderer = ({ columnIndex, rowIndex, style, parent }) => {
    const content = data[rowIndex][Object.keys(data[rowIndex])[columnIndex]];
    return (
      <CellMeasurer
        cache={cache.current}
        columnIndex={columnIndex}
        key={columnIndex}
        parent={parent}
        rowIndex={rowIndex}
      >
        {({ measure, registerChild }) => (
          <div ref={registerChild} style={style}>
            {content}
          </div>
        )}
      </CellMeasurer>
    );
  };

  const headerRenderer = ({ columnIndex, style }) => (
    <div style={{ ...style, display: 'flex', alignItems: 'center' }}>
      <div style={{ flexGrow: 1 }}>{`Column ${columnIndex + 1}`}</div>
      <Draggable
        axis="x"
        defaultClassName="DragHandle"
        defaultClassNameDragging="DragHandleActive"
        onDrag={(e, { deltaX }) => handleResize(columnIndex, deltaX)}
        position={{ x: 0, y: 0 }}
      >
        <div className="DragHandleIcon">⋮</div>
      </Draggable>
    </div>
  );

  return (
    <div style={{ height: '100vh' }}>
      <AutoSizer>
        {({ height, width }) => (
          <Grid
            ref={gridRef}
            columnCount={Object.keys(data[0]).length}
            columnWidth={getColumnWidth}
            height={height}
            rowCount={data.length}
            rowHeight={getRowHeight}
            width={width}
            deferredMeasurementCache={cache.current}
            cellRenderer={cellRenderer}
            headerRenderer={headerRenderer}
          />
        )}
      </AutoSizer>
    </div>
  );
};

export default App;
