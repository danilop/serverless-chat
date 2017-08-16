'use strict';

console.log('Loading function');

const APP_NAME = 'chat';
const DB_TABLE = 'chat';
const WINDOW_TITLE = 'Chat';
const AWS_IOT_ENDPOINT = '<AWS_IOT_ENDPOINT>';

const AWS = require('aws-sdk');
const iotdata = new AWS.IotData({endpoint: AWS_IOT_ENDPOINT});
const dynamodb = new AWS.DynamoDB.DocumentClient();

const htmlPage = `
<html>

<head>
  <title>Chat</title>
  <script src="https://sdk.amazonaws.com/js/aws-sdk-2.85.0.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js" type="text/javascript"></script>
  <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" integrity="sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u" crossorigin="anonymous">
  <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap-theme.min.css" integrity="sha384-rHyoN1iRsVXV4nD0JutlnGaslCJuC7uwjduW9SVrLvRYooPp2bWYgmgJQIXwl/Sp" crossorigin="anonymous">
</head>

<body>
  <script src="https://code.jquery.com/jquery-3.2.1.min.js" integrity="sha256-hwg4gsxgFZhOsEEamdOYGBf13FyQuiTwlAQgxVSNgt4=" crossorigin="anonymous"></script>
  <script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js" integrity="sha384-Tc5IQib027qvyjSMfHjOMaLkfuWVxZxUPnCJA7l2mCWNIpG9mGCD8wGNIcPD7Txa" crossorigin="anonymous"></script>
  <script src="/index.js"></script>
  <div id='container'>%CONTENT%</div>
</body>

</html>
`;

const htmlContent = `
<div id="messages" class="col-xs-12"></div>
<div id="prompt" class="col-xs-12">
    <form role="form" id="lineForm" class="form-horizontal">
        <div class="form-group">
            <div class="col-xs-2">
                <input type="text" class="form-control" id="user" placeholder="Your name">
            </div>
            <div class="col-xs-8">
                <input type="text" class="form-control" id="line" placeholder="Your message...">
            </div>
            <div class="col-xs-2">
                <button type="submit" class="btn btn-default" id="submitButton">Send</button>
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
                var displayText = store.replaceURLWithHTMLLinks(store.htmlEntities(m.text));
                if ('user' in m) {
                    html += '<p><strong>' + m.user + '</strong>: ' + displayText + '</p>';
                } else {
                    html += '<div class="page-header"><h1>' + displayText + '</h1></div>';
                }
            });
            document.getElementById('messages').innerHTML = html;
            window.scrollTo(0,document.body.scrollHeight);
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
            if (user.value !== '' && line.value !== '') {
                localStorage.setItem(store.room, JSON.stringify({ user: user.value }));
                store.sendMessage({ room: store.room, message: { user: user.value, text: line.value }});
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
            '<div id="messages" class="col-xs-12"><div class="page-header"><h1>Loading chat room ' +
            req.path + ' ...</h1></div></div>'
        )
    };
    console.log("response: " + JSON.stringify(response));
    callback(null, response);
}
