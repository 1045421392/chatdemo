from flask import Flask,request
import base64,redis,requests,json,jieba,logging,_thread,pymysql,datetime
from waitress import serve
from flask_cors import cross_origin,CORS
from pytz import timezone 

app = Flask(__name__)
cors = CORS(app, resources={r"/api/": {"origins": ""}})

@app.route("/", methods=['GET', 'POST'])
def hook(): 
    msgs = request.get_json(force=True)
    event = request.args.get('event')
    hand("Thread-1",msgs,event)
    return "200"

@app.route('/fenci',methods=['GET', 'POST'])
def fenci():
    text = request.args.get('s')
    words = jieba.cut(text)
    data = []
    for key in words:
        data.append(key)
    print(data)
    return data

@app.route('/send-msg',methods=['GET', 'POST'])
@cross_origin()
def sendMsgFlask():
    try:
        msgs = request.get_json(force=True)
        msg = {"content":msgs['content'],"type":1}
        response = sendMsg(json.dumps(msg),msgs['from_uid'],msgs['channel_id'],msgs['channel_type'])
        print(response.text)
        return 's'
    except Exception as e:
        print(e)
        return 'e'

def hand(name,msgs,event):
    try:
        if event=='user.onlinestatus':
            for msg in msgs:
                pass
            return
        for msg in msgs:
            from_uid = msg['from_uid']
            channel_id = msg['channel_id']
            channel_type = msg['channel_type']            
            client_msg_no = msg['client_msg_no']            
            payload = base64.b64decode(msg['payload'].encode()).decode()
            data = json.loads(payload)
            print(from_uid,channel_id,channel_type,payload)
            print(msg)
            robot = db_execute('SELECT chat_account FROM eb_supcust WHERE chat_account IS NOT NULL')
            print(robot)

            if channel_type==1:
                if (from_uid,) in robot:
                    print('机器人消息不回复')
                elif (channel_id,) in robot:                    
                    print('回复消息')
                    send_to = from_uid
                    qa = 0
                    
                    # 检查是否请求人工服务
                    if data['type']==1 and data['content'] in ['人工', '人工服务', '人工客服','客服']:
                        content = '没有相关的答案？可点击我联系人工客服'
                        msg = {"content": content, "type": 1}
                        str = json.dumps(msg)
                        sendMsg(str,channel_id,send_to,channel_type)
                        return
                        
                    if data['type']==2:
                        path = data['url']
                        content = getRplyImg(path)
                        content = getRply(content)
                        msg = {"content":content,"type":1,'is_json':True}
                        str = json.dumps(msg)
                        sendMsg(str,channel_id,send_to,channel_type)  #一对一回复 
                    else:
                        content = getRply(data['content'])
                        if content=='暂无相关问题答案':
                            content ='没有相关的答案？可点击我联系人工客服'
                            msg = {"content":content,"type":1}
                            str = json.dumps(msg)
                            sendMsg(str,channel_id,send_to,channel_type)  #一对一回复 
                            # code_set = db_execute('SELECT chat_account FROM eb_supcust WHERE chat_account="'+channel_id+'"')
                            # print(code_set)
                            # scope = code_set[0][0] if code_set else ''
                            
                            # unsolved_sql = "INSERT INTO `crmeb`.`eb_unsolved_ques` ( `ques`, `uid`,`robot`, `create_time`, `update_time`, `data`, `msg_no`,`scope`) VALUES ( %s, %s, %s, %s, %s, %s, %s, %s)" 
                            # now = datetime.datetime.now()
                            # date_str = now.strftime("%Y-%m-%d %H:%M:%S")
                            # value = (data['content'],from_uid,channel_id,d7ate_str, date_str, '',client_msg_no,scope)
                            # print('保存：',db_execute(unsolved_sql,value))
                        else:
                            msg = {"content":content,"type":1,'is_json':True}
                            str = json.dumps(msg)
                            sendMsg(str,channel_id,send_to,channel_type) #返回结果
                else:
                    print('不是发给机器人消息不回复')
            else:            
                print('群聊消息不处理')
                
        print(name+': success ')
    except Exception as e:
        print(e.__context__)
        print(e)

def sendMsg(data:str,from_uid,channel_id,channel_type):
    data_bytes = data.encode('utf8')
    base_data = base64.b64encode(data_bytes)
    payload = json.dumps({
    "header": {
        "no_persist": 0,
        "red_dot": 1,
        "sync_once": 0
    },
    "from_uid": from_uid,
    "stream_no": "",
    "channel_id": channel_id,
    "channel_type": channel_type,
    "payload": base_data.decode()
    })
    headers = {}
    url = "http://127.0.0.1:5001/message/send"
    response = requests.request("POST", url, headers=headers, data=payload)
    print(response.text)
    return response

def getRply(text):
    url = "http://127.0.0.1:8093/site/fullt?k="+text    
    payload={}
    headers = {}
    response = requests.request("GET", url, headers=headers, data=payload)
    return response.text

def getRplyImg(path):
    #path = "/www/wwwroot/l8093/backend/web/qam/img/20240507/1715051628307031.png"
    url = "http://120.24.187.119:31000/ocr?s="+path
    url = "http://127.0.0.1:3100/ocr?s="+path
    payload={}
    headers = {}
    response = requests.request("GET", url, headers=headers, data=payload)
    return  response.text
def conDb():
# 建立数据库连接
    conn = pymysql.connect(
        host='120.24.187.119',	# 主机名（或IP地址） '120.24.187.119',	
        port=3306,				# 端口号，默认为3306
        user='root',			# 用户名
        password='7cd3f01d7ec6b0be',	# 密码   '7cd3f01d7ec6b0be',
        charset='utf8mb4'  		# 设置字符编码
    )
    print(conn.get_server_info())
    cursor = conn.cursor()
    conn.select_db("crmeb") 
    # 关闭游标和连接
    #cursor.close()
    #conn.close()
    return (cursor,conn)
def db_execute(sql,value=()):
     # 执行查询操作
    try:
        cursor.execute(sql)        
        print('********insert return id:',sql,cursor.lastrowid)
        print('********commit:',conn.commit())
        # 获取查询结果，返回元组
        result : tuple = cursor.fetchall()
        return result
    except:
        db = conDb()
        cursor = db[0]
        conn = db[1]
        cursor.execute(sql,value)
        print('********insert return id:',sql,cursor.lastrowid)
        print('********commit:',conn.commit())
        # 获取查询结果，返回元组
        result : tuple = cursor.fetchall()
        return result
db = conDb()
cursor = db[0]
conn = db[1]
robot_ = db_execute('SELECT chat_account FROM eb_supcust WHERE chat_account IS NOT NULL')
print(robot_)
#app.run()
app.run(host="0.0.0.0", port="5000")
# app.run(host='localhost', port=8080, threaded=False, processes=1)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
#serve(app, host='localhost', port=5000, threads=1) 
logger.info('Waitress server is running on http://localhost:5000')


