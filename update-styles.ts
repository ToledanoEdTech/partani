import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Table header / cells spacing mappings
code = code.replace(/className="p-4"/g, 'className="px-6 py-4"');
code = code.replace(/<td className="p-4 text-gray-700">{s\.hour}<\/td>/g, '<td className="px-6 py-4 font-mono text-xs text-gray-700">{s.hour}</td>');
code = code.replace(/<th className="p-4/g, '<th className="px-6 py-4');
code = code.replace(/<td className="p-4/g, '<td className="px-6 py-4');

// Border radius for table/container match High Density theme
code = code.replace(/bg-white rounded-lg shadow-sm border overflow-hidden/g, 'bg-white rounded-lg border border-gray-200 shadow-sm flex-1 overflow-hidden');

fs.writeFileSync('src/App.tsx', code);
