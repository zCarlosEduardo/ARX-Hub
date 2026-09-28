window.Icons = (function () {
  const e = React.createElement;
  const L = (x1, y1, x2, y2) => e('line', { x1, y1, x2, y2 });
  const C = (cx, cy, r) => e('circle', { cx, cy, r });
  const CF = (cx, cy, r, color) => e('circle', { cx, cy, r, fill: color, stroke: 'none' });
  const P = (d) => e('path', { d });
  const PL = (pts) => e('polyline', { points: pts });
  const RC = (x, y, w, h, rx) => e('rect', { x, y, width: w, height: h, rx: rx || 0 });

  const DEFS = {
    X: () => [L(18, 6, 6, 18), L(6, 6, 18, 18)],
    Plus: () => [L(12, 5, 12, 19), L(5, 12, 19, 12)],
    Search: () => [C(11, 11, 8), L(21, 21, 16.65, 16.65)],
    MoreHorizontal: (c) => [CF(12, 12, 1.4, c), CF(19, 12, 1.4, c), CF(5, 12, 1.4, c)],
    Pencil: () => [P('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .622.622l4.353-1.321a2 2 0 0 0 .83-.497Z'), L(15, 5, 19, 9)],
    Copy: () => [RC(9, 9, 13, 13, 2), P('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')],
    ExternalLink: () => [P('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'), PL('15 3 21 3 21 9'), L(10, 14, 21, 3)],
    Trash2: () => [P('M3 6h18'), P('M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'), L(10, 11, 10, 17), L(14, 11, 14, 17), P('M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2')],
    RefreshCw: () => [P('M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), P('M3 3v5h5'), P('M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16'), P('M16 16h5v5')],
    Maximize2: () => [PL('15 3 21 3 21 9'), PL('9 21 3 21 3 15'), L(21, 3, 14, 10), L(3, 21, 10, 14)],
    Loader2: () => [P('M21 12a9 9 0 1 1-6.219-8.56')],
    WifiOff: () => [L(2, 2, 22, 22), P('M8.5 16.5a5 5 0 0 1 7 0'), P('M5 12.5a10.94 10.94 0 0 1 3.36-2.3'), P('M19 12.5a10.94 10.94 0 0 0-2.5-2.1'), P('M10.71 5.05A16 16 0 0 1 22.58 9'), P('M1.42 9a15.91 15.91 0 0 1 4.7-2.88'), L(12, 20, 12.01, 20)],
    AlertCircle: () => [C(12, 12, 10), L(12, 8, 12, 12), L(12, 16, 12.01, 16)],
    Server: (c) => [RC(2, 2, 20, 8, 2), RC(2, 14, 20, 8, 2), CF(6, 6, 1, c), CF(6, 18, 1, c)],
    Activity: () => [PL('22 12 18 12 15 21 9 3 6 12 2 12')],
    FileText: () => [P('M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z'), PL('14 2 14 8 20 8'), L(16, 13, 8, 13), L(16, 17, 8, 17), L(10, 9, 8, 9)],
    Building2: () => [P('M6 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18Z'), P('M6 12H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2'), P('M18 9h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2'), L(9, 6, 11, 6), L(13, 6, 15, 6), L(9, 10, 11, 10), L(13, 10, 15, 10), L(9, 14, 11, 14), L(13, 14, 15, 14)],
    Receipt: () => [P('M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z'), L(8, 7, 16, 7), L(8, 11, 16, 11), L(8, 15, 13, 15)],
    Users: () => [P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), C(9, 7, 4), P('M22 21v-2a4 4 0 0 0-3-3.87'), P('M16 3.13a4 4 0 0 1 0 7.75')],
    BarChart3: () => [P('M3 3v18h18'), L(18, 17, 18, 9), L(13, 17, 13, 5), L(8, 17, 8, 13)],
    Bot: (c) => [RC(3, 11, 18, 10, 2), C(12, 5, 2), L(12, 7, 12, 11), CF(8, 16, 1, c), CF(16, 16, 1, c)],
    Workflow: () => [RC(3, 3, 8, 8, 2), RC(13, 13, 8, 8, 2), P('M7 11v3a2 2 0 0 0 2 2h3')],
    Container: () => [P('M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'), L(3.3, 7, 12, 12), L(12, 12, 20.7, 7), L(12, 22, 12, 12)],
    Inbox: () => [P('M22 12h-6l-2 3h-4l-2-3H2'), P('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z')],
    LayoutDashboard: () => [RC(3, 3, 7, 9, 1), RC(14, 3, 7, 5, 1), RC(14, 12, 7, 9, 1), RC(3, 16, 7, 5, 1)],
    LifeBuoy: () => [C(12, 12, 10), C(12, 12, 4), L(4.93, 4.93, 9.17, 9.17), L(14.83, 14.83, 19.07, 19.07), L(14.83, 9.17, 19.07, 4.93), L(4.93, 19.07, 9.17, 14.83)],
    ArrowLeft: () => [L(19, 12, 5, 12), PL('12 19 5 12 12 5')],
  };

  function Icon(name, size, color, strokeWidth) {
    const factory = DEFS[name];
    if (!factory) return null;
    const col = color || '#EDEDED';
    const kids = factory(col).map((el, i) => React.cloneElement(el, { key: i }));
    return e('svg', {
      width: size || 18,
      height: size || 18,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: col,
      strokeWidth: strokeWidth == null ? 1.75 : strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: { flexShrink: 0, display: 'block' },
    }, kids);
  }

  return {
    Icon,
    NAMES: Object.keys(DEFS),
    ICON_CHOICES: ['Workflow', 'Bot', 'Server', 'Container', 'Activity', 'FileText', 'Building2', 'Receipt', 'Users', 'BarChart3'],
    COLOR_CHOICES: ['#1E4A9E', '#6DBE6A', '#F5A524', '#F5514D', '#8B5CF6', '#14B8A6'],
    CATEGORY_CHOICES: [
      { key: 'visto', label: 'Visto', color: '#7DD3FC' },
      { key: 'sga', label: 'SGA', color: '#3B82F6' },
      { key: 'powercrm', label: 'PowerCRM', color: '#F5514D' },
      { key: 'interno', label: 'Interno', color: '#9CA3AF' },
      { key: 'db', label: 'Banco de Dados', color: '#8B5CF6' },
    ],
  };
})();
