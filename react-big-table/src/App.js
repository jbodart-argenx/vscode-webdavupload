// src/App.js
import React, { useRef, useCallback, useState } from 'react';
import { AutoSizer, Grid, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import Draggable from 'react-draggable';
import 'react-virtualized/styles.css'; // only needs to be imported once

function generateDummyText(minLength, maxLength) {
  const words = [
      'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do',
      'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'ut',
      'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris',
      'nisi', 'ut', 'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'dolor',
      'in', 'reprehenderit', 'in', 'voluptate', 'velit', 'esse', 'cillum', 'dolore', 'eu', 'fugiat',
      'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt',
      'in', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum'
  ];
  const wordsLength = words.length;
  const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  let result = '';

  while (result.split(' ').length < length) {
      const word = words[Math.floor(Math.random() * wordsLength)];
      result += word + ' ';
  }

  return result.trim() + '.';
}

const data = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `Name ${i}`,
  value: `Value ${i}`,
  description: `${generateDummyText(10,150)}`
}));

const initialColumnWidths = [80, 100, 120, 1000]; // Example initial widths for each column

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

  const cellRenderer = ({ columnIndex, key, rowIndex, style, parent }) => {
    const content = data[rowIndex][Object.keys(data[rowIndex])[columnIndex]];
    return (
      <CellMeasurer
        cache={cache.current}
        columnIndex={columnIndex}
        key={key}
        parent={parent}
        rowIndex={rowIndex}
      >
        {({ measure, registerChild }) => (
          <div ref={registerChild} style={{ ...style, border: '1px solid black', boxSizing: 'border-box' }}>
            {content}
          </div>
        )}
      </CellMeasurer>
    );
  };

  const headerRenderer = ({ columnIndex, style }) => (
    <div style={{ ...style, display: 'flex', alignItems: 'center', border: '1px solid black', boxSizing: 'border-box' }}>
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
