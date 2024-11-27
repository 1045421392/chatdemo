// 使用生产环境还是开发环境
const ENV = 'PROD' // 可以改为 'DEV'开发/'PROD'生产



// 服务器配置
export const SERVER_CONFIG = {
  // 生产环境配置
  PROD: {
    HOST: 'http://120.24.187.119:8093',  // api路径
    WS_HOST: 'ws://kefu.coolsaas.com.cn:5200',  // 聊天ws路径
    UPLOAD_SERVER: 'http://kefu.coolsaas.com.cn:10003'  // 图片上传路径
  },
  // 开发环境配置
  DEV: {
    HOST: 'http://192.168.1.167:8012',
    WS_HOST: 'ws://kefu.coolsaas.com.cn:5200',
    UPLOAD_SERVER: 'http://kefu.coolsaas.com.cn:10003'
  }
}


// 只导出服务器配置
export const getServerConfig = () => SERVER_CONFIG[ENV]