'use strict';

console.log('Loading function');

const APP_NAME = 'chat';
const DB_TABLE = 'chat';
const WINDOW_TITLE = 'Chat';
const AWS_IOT_ENDPOINT = process.env.AWS_IOT_ENDPOINT;

const AWS = require('aws-sdk');
const iotdata = new AWS.IotData({endpoint: AWS_IOT_ENDPOINT});
const dynamodb = new AWS.DynamoDB.DocumentClient();

const htmlPage = `
<html>

<head>
  <title>Babel Chat</title>
  <script src="https://sdk.amazonaws.com/js/aws-sdk-2.340.0.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js" type="text/javascript"></script>
  <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css" integrity="sha384-MCw98/SFnGE8fJT3GXwEOngsV7Zt27NXFoaoApmYm81iuXoPkFOJwJ8ERdknLPMO" crossorigin="anonymous">
  <link rel="stylesheet" href="/custom.css">
</head>

<body>
  <script src="https://code.jquery.com/jquery-3.3.1.slim.min.js" integrity="sha384-q8i/X+965DzO0rT7abK41JStQIAqVgRVzpbzo5smXKp4YfRvH+8abtTE1Pi6jizo" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.3/umd/popper.min.js" integrity="sha384-ZMP7rVo3mIykV+2+9J3UJ46jBk0WLaUAdn689aCwoqbBJiSnjAK/l8WvCWPIPm49" crossorigin="anonymous"></script>
  <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/js/bootstrap.min.js" integrity="sha384-ChfqqxuZUCnJSK3+MXmPNIyE6ZbWh2IMqE241rYiqJxyMiZ6OW/JmZQ5stwEULTy" crossorigin="anonymous"></script>
  <script src="/index.js"></script>
  <div id="container" class="container-fluid">%CONTENT%</div>
</body>

</html>
`;

const htmlContent = `
<div id="messages" class="col-sm-12" style="max-height: 70%; overflow: auto;"></div>
<div id="prompt" class="col-sm-12">
    <form role="form" id="lineForm" class="form-horizontal">
            <div class="form-row">
                <div id="translateBox" class="col-sm-12 mb-2 alert alert-primary">
                  Translate to:
                  <select id="target_lang" class="custom-select">
                    <option value="en">🇬🇧</option>
                    <option value="fr">🇫🇷</option>
                    <option value="de">🇩🇪</option>
                    <option value="it">🇮🇹</option>
                    <option value="pt">🇵🇹</option>
                    <option value="es">🇪🇸</option>
                    <option value="ru">🇷🇺</option>
                    <option value="he">🇮🇱</option>
                    <option value="zh">🇨🇳</option>
                    <option value="ja">🇯🇵</option>
                  </select>
                </div>
            </div>
            <div class="form-row align-items-center">
                    <div class="col-sm-2">
                      <input type="text" class="form-control mb-1" id="user" placeholder="Your name">
                    </div>
                    <div class="col-sm-8">
                      <input type="text" class="form-control mb-1" id="line" placeholder="Your message...">
                    </div>
                    <div class="col-sm-2">
                      <button type="submit" class="btn btn-primary mb-1" id="submitButton">Send</button>
                    </div>
            </div>
        </div>
    </form>
</div>
`;

exports.handler = (event, context, callback) => {
    console.log(event);

    if ('Records' in event) {
        event.Records.forEach((record) => {
            // Kinesis data is base64 encoded so decode here
            const payload = new Buffer(record.kinesis.data, 'base64').toString('ascii');
            console.log('Decoded payload:', payload);
            routeData(JSON.parse(payload));
        });
        callback(null, `Successfully processed ${event.Records.length} records.`);
    } else if ('httpMethod' in event) {
        processHttpRequest(event, callback);
    } else {
        routeData(event);
    }
};

function routeData(data) {
    if ('eventType' in data) {
        console.log(data.eventType + ': ' + data.clientId);
    } else if ('connected' in data && data.connected === true) {
        clientConnected(data);
    } else if ('sendroom' in data) {
        sendAllMessages(data);
    } else {
        console.log('ignored: ' + data);
    }
}

function sendAllMessages(inputData) {
    var params = {
        TableName: DB_TABLE,
        KeyConditionExpression: 'room = :hkey',
        ExpressionAttributeValues: {
            ':hkey': inputData.sendroom
        }
    }

    dynamodb.query(params, function(err, data) {
        if (err) console.log(err);
        else {
            console.log(data);
            var clientTopic = APP_NAME + "/in/" + inputData.clientId;

            var messages = [];
            data.Items.forEach((item) => {
                messages.push(item.message);
            });

            function run(message) {
                store.messages = store.messages.concat(message.messages);
                store.renderMessages();
            }

            var message = {
                run: run.toString(),
                room: inputData.sendroom,
                messages: messages
            };

            sendMessage(clientTopic, message);
        }
    });
}

function clientConnected(data) {

    var clientTopic = APP_NAME + "/in/" + data.clientId;

    function run(message) {
        store.messages = message.messages;
        store.room = message.room;
        store.windowTitle = message.windowTitle;
        var pubTopic = APP_NAME + "/pub" + store.room;
        console.log('subscribe: ' + pubTopic);
        client.subscribe(pubTopic);

        document.getElementById('container').innerHTML = message.htmlContent;

        store.replaceURLWithHTMLLinks = function(text) {
            var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
            return text.replace(exp,"<a href='$1'>$1</a>");
        }
        store.htmlEntities = function(str) {
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        store.renderMessages = function() {
            var html = '';
            store.messages.forEach((m) => {
                console.log(m);
                var displayText = store.replaceURLWithHTMLLinks(store.htmlEntities(m.text));
                if ('user' in m) {
                    html += '<p><strong>' + m.user + '</strong>: <span id="' + m.timestamp + '">' + displayText + '</span></p>';
                } else {
                    html += '<div class="page-header"><h3>' + displayText + '</h3></div>';
                }
            });
            document.getElementById('messages').innerHTML = html;
        };
        store.sendMessage = function(msg) {
            var mqttMsg = new Paho.MQTT.Message(JSON.stringify(msg));
            mqttMsg.destinationName = APP_NAME + "/out";
            client.send(mqttMsg);
        };
        store.onMessageArrived = function(topic, msg) {
            if ('message' in msg) {
                store.messages.push(msg.message);
                store.renderMessages();
            }
        };

        if (localStorage.getItem(store.room) != null) {
            document.getElementById('user').value = JSON.parse(localStorage.getItem(store.room)).user;
        }

        var form = document.getElementById('lineForm');
        form.addEventListener('submit', function(evt) {
            evt.preventDefault();
            var user = document.getElementById('user');
            var line = document.getElementById('line');
            //var source_language = document.getElementById('source_lang');
            var target_language = document.getElementById('target_lang');
            var timestamp_date = Date.now();
            if (user.value !== '' && line.value !== '') {
                localStorage.setItem(store.room, JSON.stringify({ user: user.value }));
                store.sendMessage({ room: store.room, message: { user: user.value, text: line.value, source_lang: 'en', timestamp: timestamp_date}});
                line.value = '';
            }
        });

        document.title = store.windowTitle + ' ' + store.room;

        store.renderMessages();
        store.sendMessage({ sendroom: message.room });

    }

    var message = {
        run: run.toString(),
        htmlContent: htmlContent,
        windowTitle: WINDOW_TITLE,
        room: data.path,
        messages: [ { text: 'Welcome to chat room ' + data.path } ]
    };

    sendMessage(clientTopic, message);
}

function sendMessage(topic, message) {

    var params = {
        topic: topic,
        payload: JSON.stringify(message),
        qos: 1
    };

    console.log('publishing to topic: ' + topic);

    iotdata.publish(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else     console.log(data);           // successful response
    });
}

function processHttpRequest(req, callback) {
    var response = {
        statusCode: 200,
        headers: {
            "Content-Type": "text/html"
        },
        body: htmlPage.replace("%CONTENT%",
            '<div id="messages" class="col-xs-12"><div class="page-header"><h3>Loading chat room ' +
            req.path + ' ...</h3></div></div>'
        )
    };
    console.log("response: " + JSON.stringify(response));
    callback(null, response);
}
