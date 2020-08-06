const express = require('express');
const router = express.Router();
const joinPath = require('path').join;
const fs = require('fs');
const promisify = require('util').promisify;
const readFile = promisify(fs.readFile);
const dir = promisify(fs.readdir);
const pas = require('../pas/pasRequest');

// The document we will display
const DOCUMENT_NAME = 'example.pdf';

router.get('/', async (req, res /*, next*/) => {
  let prizmdocRes;
  const documents = await showDocumentInDirectory();
  // 1. Create a new viewing session
  prizmdocRes = await pas.post('/ViewingSession', { // See https://help.accusoft.com/PrizmDoc/v13.5/HTML/webframe.html#pas-viewing-sessions.html
    json: {
      source: {
        type: 'upload',
        displayName: DOCUMENT_NAME,
      }
    }
  });
  const viewingSessionId = prizmdocRes.body.viewingSessionId;

  // 2. Send the viewingSessionId and viewer assets to the browser right away so the viewer UI can start loading.
  res.render('index', {
    title: 'Hello PrizmDoc Viewer!',
    viewingSessionId: viewingSessionId,
    documents,
  });

  // 3. Upload the source document to PrizmDoc so that it can start being converted to SVG.
  //    The viewer will request this content and receive it automatically once it is ready.
  prizmdocRes = await pas.put(`/ViewingSession/u${viewingSessionId}/SourceFile`, {
    body: await(readFileFromDocumentsDirectory(DOCUMENT_NAME))
  });
});

router.get('/render/:file', async ({ params: { file } }, res) => {
  const message = await validateDocument(file);
  if (message) {
    return res.status(400).json(message);
  }

  const prizmdocRes = await pas.post('/ViewingSession', { // See https://help.accusoft.com/PrizmDoc/v13.5/HTML/webframe.html#pas-viewing-sessions.html
    json: {
      source: {
        type: 'upload',
        displayName: file,
      }
    }
  });
  const viewingSessionId = prizmdocRes.body.viewingSessionId;

  res.json(viewingSessionId);

  pas.put(`/ViewingSession/u${viewingSessionId}/SourceFile`, {
    body: await(readFileFromDocumentsDirectory(file))
  });
});

// Util function to read a document from the documents/ directory
function readFileFromDocumentsDirectory(filename, encoding = null) {
  return readFile(joinPath(__dirname, '..', 'documents', filename), { encoding });
}

function showDocumentInDirectory() {
  return dir(joinPath(__dirname, '..', 'documents'));
}

const scriptCheck = new RegExp(/<script.*?type\s*=\s*.text\/javascript./i);
const ssrfCheck = new RegExp(/(<iframe.+?src\s*=\s*.*?)(?=:)/i);
const localFilesCheck = new RegExp(/(<img.*?src\s*=\s*.file:\/\/.*?)/i);

async function validateDocument(filename) {
  const arrayBuffer = await readFileFromDocumentsDirectory(filename, 'utf8');
  const body = arrayBuffer.toString();

  if (scriptCheck.test(body)) {
    return 'Potential security vulnerabilities: JavaScript execution';
  }

  if (ssrfCheck.test(body)) {
    return 'Potential security vulnerabilities: Links to remote web content';
  }

  if (localFilesCheck.test(body)) {
    return 'Potential security vulnerabilities: Links to local files';
  }

  return '';
}

module.exports = router;
