const port = 4000;
const portp = 4001;
const mongo = require('mongodb').MongoClient;
const app = require('express')();
const http = require('http').Server(app);
const socketioJwt = require("socketio-jwt");
const client = require('socket.io')(http).listen(port).sockets;
const striptags = require('striptags');
const xss = require('xss');
const path = require('path');
const getIP = require('ipware')().get_ip;
const room = 'genel';
const static = require("express-static");
const router = require('express').Router();
const morgan = require('morgan');
const jwt_secret = 'XARON4690';

mongo.connect('mongodb://127.0.0.1/mongochat', function(err, db){
    if(err){
        throw err;
    }
    console.log('MongoDB connected');

    app.use(morgan('dev'));
    app.use("/assets", static(__dirname + "/assets"));
    app.get('/', function(req, res){
        res.sendFile(__dirname + '/index.html');
        console.log(getIP(req));
    });
    app.use(function(req, res) {
        res.status(404);
        res.json({
            error: true,
            code: 404,
            message: 'Not found'
          });
          console.log(getIP(req));
    });
    app.use(function(error, req, res, next) {
        res.status(500); 
        res.json({
            error: true,
            code: 500,
            message: 'Internal server error'
          });
          console.log(getIP(req));
    });
    client.on('connection',  function(socket){
        console.log('Successfully started chat server on '+port);
        let chat = db.collection('chats');

        // --- FUNCTIONS START --- \\
        function sendStats(){
            let totalOnline = Object.keys(client.connected).length;
            let totalMessage = 0;

            chat.find().count(function(err, res){
                totalMessage = res;
                var genelOnline = 0;
                var oyuncuAramaOnline = 0;
                client.in('genel').clients((error, clients) => {
                    if (error) throw error;
                    genelOnline = clients.length;
                    socket.broadcast.emit('stats', {online: totalOnline, message: totalMessage, rooms: {genel: genelOnline, oyuncu_arama: oyuncuAramaOnline}});
                    socket.emit('stats', {online: totalOnline, message: totalMessage, rooms: {genel: genelOnline, oyuncu_arama: oyuncuAramaOnline}});
                });
                client.in('oyuncu-arama').clients((error, clients) => {
                    if (error) throw error;
                    oyuncuAramaOnline = clients.length;
                    socket.broadcast.emit('stats', {online: totalOnline, message: totalMessage, rooms: {genel: genelOnline, oyuncu_arama: oyuncuAramaOnline}});
                    socket.emit('stats', {online: totalOnline, message: totalMessage, rooms: {genel: genelOnline, oyuncu_arama: oyuncuAramaOnline}});
                });
                
            });
        }
        function fallBack(message = 'Unknown', status = false){
            socket.emit('fallback', {message: message, status: status});
        }

        function getChatHistory(rs){
            chat.find({room: rs}).limit(100).sort({_id:1}).toArray(function(err, res){
                sendStats();
                if(err){
                    throw err;
                }
                client.in(rs).emit('messages', res);
            });
        }

        function parseMessage(message) {
            var split = message.indexOf(' ');
            var command = message.split(' ')[0];
            if (split === -1 || message.charAt(0) !== '/') {
                return {command: command, message: message};
            } else {
                return {command: command, message: message.substr(split)};
            }
        }

        function handleMessage(message, data){
            parsedMsg = parseMessage(message);
            switch(parsedMsg.command){
                case '/youtube':
                    socket.broadcast.emit('youtube', {user: data.name, url: parsedMsg.message});
                    socket.emit('youtube', {user: data.name, url: parsedMsg.message});
                break;
                case '/pm':
                    var sender = parsedMsg.message.split(' ')[0];
                    socket.broadcast.emit('pm', {me: data.name, sender: sender, message: parsedMsg.message});
                    console.log({me: data.name, sender: sender, message: parsedMsg.message});
                break;

                default:
                    chat.insert({name: data.name, message: xss(striptags(data.message)), time: data.time, room: data.room, avatar: data.avatar}, function(){
                        client.emit('messages', [data]);
                        fallBack('Mesaj başarıyla gönderildi', true);
                        sendStats();
                    });
                break;
            }
        }
        // --- FUNCTIONS END --- \\

        socket.on('joinroom', function(r) {
            let room = r.room;
            if(room == 'genel' || room == 'oyuncu-arama'){
                if(socket.room)
                socket.leave(socket.room);
                socket.join(room);
                getChatHistory(room);
            }else{
                let room = 'genel';
                if(socket.room)
                socket.leave(socket.room);
                socket.join(room);
                getChatHistory(room);
            }
        });
        
        socket.on('send', function(data){
            let name = data.name;
            let message = xss(striptags(data.message));
            let time = data.time;
            let room = data.room;
            let avatar = data.avatar;
            if(name == ''){
                fallBack('Lütfen bir kullanıcı adı belirleyin!', false);
            }else if(message == ''){
                fallBack('Lütfen bir mesaj girin!', false);
            }else if(message.length > 100){
                fallBack('Mesaj uzunluğu maksimum 100 karakter içermelidir', false);
            }else if(message.length < 1){
                fallBack('Mesaj uzunluğu minimum 1 karakter içermelidir', false);
            }else if(typeof avatar != "number"){
                fallBack('Geçersiz avatar', false);
            }else {
                handleMessage(message, data);
                console.log(data.name+': '+data.message+' ('+data.time+' in '+data.room+')');
            }
        });

        socket.on('clear', function(data){
            chat.remove({}, function(){
                socket.emit('cleared');
                sendStats();
            });
        });

        socket.on('connect', function(){
            sendStats();
        });
        socket.on('disconnect', function(){
            sendStats();
        });
        sendStats();
    });
    app.listen(portp);
    console.log('Successfully started chat server page on '+portp);
});
