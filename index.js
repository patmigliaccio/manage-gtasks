const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {google} = require('googleapis');
const Papa = require('papaparse');

const { TASKLIST_ID } = process.env;

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/tasks.readonly'];
const TOKEN_PATH = 'token.json';

async function main() {
  const auth = await authenticate();
  const tasks = await getTasks(auth, TASKLIST_ID);

  const csv = await toCSVString(tasks);
  const filename = path.join('data', `tasks_${new Date().toISOString()}.csv`);
  toFile(filename, csv);
}

(async () => {
  await main();
})();

function authenticate() {
  return new Promise((resolve, reject) => {
    // Load client secrets from a local file.
    fs.readFile('credentials.json', (err, content) => {
      if (err) {
        console.error('Error loading client secret file:', err);
        reject(err);
        return;
      }
      // Authorize a client with credentials, then call the Google Tasks API.
      resolve(authorize(JSON.parse(content)))
    });
  })
}

function authorize(credentials) {
  return new Promise((resolve, reject) => {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);
  
    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getNewToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      resolve(oAuth2Client);
    });
  })
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

async function getTaskLists(auth) {
  return new Promise((resolve, reject) => {
    const service = google.tasks({version: 'v1', auth});
    service.tasklists.list({
      maxResults: 10,
    }, (err, res) => {
      if (err) {
        console.error('The API returned an error: ' + err);
        reject(err);
        return;
      }

      const taskLists = res.data.items;
      resolve(taskLists || []);
    })
  })
}

async function getTasks(auth, tasklistId, limit = 100) {
  return new Promise((resolve, reject) => {
    const service = google.tasks({version: 'v1', auth});
    service.tasks.list({
      tasklist: tasklistId,
      maxResults: limit
    }, (err, res) => {
      if (err) {
        console.error('The API returned an error: ' + err);
        reject(err);
        return;
      }

      const tasks = res.data.items || [];
      resolve(handleTasksResponse(tasks));
    })
  })
}

async function getTask(auth, tasklistId, taskId) {
  return new Promise((resolve, reject) => {
    const service = google.tasks({version: 'v1', auth});
    service.tasks.get({
      tasklist: tasklistId,
      task: taskId
    }, (err, res) => {
      if (err) {
        console.error('The API returned an error: ' + err);
        reject(err);
        return;
      }

      const task = res.data;
      resolve(handleTaskResponse(task));
    })
  })
}

const toCSVString = (items) => {
  return new Promise((resolve, reject) => {
    const csv = Papa.unparse(items);
    resolve(csv);
  })
}

const toFile = (filepath, str) => {
  fs.writeFile(filepath, str, (err) => {
    if (err) console.error(err);
  });
}

const handleTasksResponse = (tasks) => 
  tasks.map(handleTaskResponse)

const handleTaskResponse = ({ 
  id, 
  title, 
  updated, 
  notes = '', 
  status,
} = {}) => {
  if (!id) return null;

  return {
    id,
    title,
    updated,
    notes,
    status
  }
};