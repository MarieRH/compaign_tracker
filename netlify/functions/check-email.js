const Imap = require('imap');
const { inspect } = require('util');

exports.handler = async (event, context) => {
  // Allow only POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { email, password, server, port, subjectFilter, fromFilter } = body;

    // Validate input
    if (!email || !password || !server || !port) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // IMAP configuration
    const imap = new Imap({
      user: email,
      password: password,
      host: server,
      port: parseInt(port),
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    // Results object
    let results = {
      inbox: 0,
      spam: 0,
      total: 0
    };

    // Promise wrapper for IMAP operations
    const fetchEmails = () => {
      return new Promise((resolve, reject) => {
        imap.once('ready', () => {
          // Check INBOX
          imap.openBox('INBOX', true, (err, box) => {
            if (err) {
              reject(err);
              return;
            }

            searchFolder('INBOX', subjectFilter, fromFilter, (inboxCount) => {
              results.inbox = inboxCount;

              // Check SPAM/Junk folder
              imap.openBox('[Gmail]/Spam', true, (err, box) => {
                if (err) {
                  // Try alternative spam folder names
                  imap.openBox('Spam', true, (err2, box2) => {
                    if (err2) {
                      imap.openBox('Junk', true, (err3, box3) => {
                        if (err3) {
                          // No spam folder found
                          results.spam = 0;
                          results.total = results.inbox;
                          imap.end();
                          resolve(results);
                        } else {
                          searchFolder('Junk', subjectFilter, fromFilter, (spamCount) => {
                            results.spam = spamCount;
                            results.total = results.inbox + results.spam;
                            imap.end();
                            resolve(results);
                          });
                        }
                      });
                    } else {
                      searchFolder('Spam', subjectFilter, fromFilter, (spamCount) => {
                        results.spam = spamCount;
                        results.total = results.inbox + results.spam;
                        imap.end();
                        resolve(results);
                      });
                    }
                  });
                } else {
                  searchFolder('[Gmail]/Spam', subjectFilter, fromFilter, (spamCount) => {
                    results.spam = spamCount;
                    results.total = results.inbox + results.spam;
                    imap.end();
                    resolve(results);
                  });
                }
              });
            });
          });
        });

        imap.once('error', (err) => {
          reject(err);
        });

        imap.once('end', () => {
          console.log('Connection ended');
        });

        imap.connect();
      });
    };

    // Search function
    function searchFolder(folderName, subject, from, callback) {
      let criteria = ['ALL'];
      
      if (subject) {
        criteria = [['SUBJECT', subject]];
      }
      
      if (from) {
        if (subject) {
          criteria = [['SUBJECT', subject], ['FROM', from]];
        } else {
          criteria = [['FROM', from]];
        }
      }

      imap.search(criteria, (err, results) => {
        if (err) {
          callback(0);
          return;
        }
        callback(results.length);
      });
    }

    // Execute IMAP operations
    const data = await fetchEmails();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message || 'Failed to fetch emails' 
      })
    };
  }
};
