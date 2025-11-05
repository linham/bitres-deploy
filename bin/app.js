#!/usr/bin/env node

// 强制加载 .env 文件
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const cdk = require('aws-cdk-lib');
const { MainStack } = require('../lib/main-stack');
const { ApiDocStack } = require('../lib/apiDoc-stack');

// 获取区域配置，优先级：命令行参数 > 环境变量 > 默认值
const region = process.env.CDK_DEFAULT_REGION
const account = process.env.CDK_DEFAULT_ACCOUNT;

console.log('==========================================');
console.log('📍 CDK Deployment Configuration:');
console.log(`   Region: ${region}`);
console.log(`   Account: ${account || 'Using AWS CLI default'}`);
console.log('==========================================\n');

const app = new cdk.App();

new MainStack(app, 'CognitoLambdaStack', {//todo rename MainStack
  env: {
    account: account,
    region: region,
  },
  description: 'Cognito with Lambda triggers and callback integration',
});

new ApiDocStack(app, 'ApiDocStack', {
    env: {
        account: account,
        region: region,
    },
    description: 'API documentation stack',
});

app.synth();
