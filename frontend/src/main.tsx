import React from 'react';
import ReactDOM from 'react-dom/client';
import { Editor } from './editor/Editor';
import './styles/index.css';
import './editor/editor.css';
import './styles/product.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
