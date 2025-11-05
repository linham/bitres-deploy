const https = require('https');
const http = require('http');
const url = require('url');
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const axios = require('axios');

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

// const ddb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

/**
 * Cognito 触发器 Lambda 函数
 * 处理各种 Cognito 事件并回调到外部 Node.js 程序
 *
 * event.triggerSource:
 *  PreSignUp_SignUp
 *  admin_create_user
 *  post_confirmation
 *  post_authentication
 *  PreAuthentication_Authentication
 *  PreTokenGeneration_Authentication
 *  UserMigration_Authentication
 *  UserMigration_ForgotPassword
 */
exports.handler = async (event, context) => {
    console.log('Received Cognito event:', JSON.stringify(event, null, 2));

    const triggerSource = event.triggerSource;
    const userAttributes = event.request.userAttributes || {};

    // // 准备回调数据
    // const callbackData = {
    //     triggerSource: triggerSource,
    //     userPoolId: event.userPoolId,
    //     userName: event.userName,
    //     userAttributes: userAttributes,
    //     timestamp: new Date().toISOString(),
    //     metadata: {
    //         region: event.region || process.env.AWS_REGION,
    //         requestId: context.requestId,
    //     }
    // };
    //
    // try {
    //     // 发送回调到您的 Node.js 程序
    //     await sendCallback(callbackData);
    //     console.log('Callback sent successfully');
    // } catch (error) {
    //     console.error('Failed to send callback:', error);
    //     // 注意：即使回调失败，我们也返回 event 以不阻断 Cognito 流程
    // }

    // 根据不同的触发器类型处理响应
    switch (triggerSource) {
        case 'PreSignUp_SignUp':
        case 'PreSignUp_AdminCreateUser':
            await checkEmailUniqueness(event.userPoolId, userAttributes.email, triggerSource);
            event.response.autoConfirmUser = false;
            event.response.autoVerifyEmail = false;
            break;
        
        case 'PreSignUp_ExternalProvider':
            await checkEmailUniqueness(event.userPoolId, userAttributes.email, triggerSource);
            event.response.autoConfirmUser = true;
            event.response.autoVerifyEmail = true;
            break;

        case 'PostConfirmation_ConfirmSignUp':
            console.log('User confirmed:', event.userName);
            await confirmEmailCallback(event.userPoolId, event.userName, userAttributes.email);
            break;

        case 'PostAuthentication_Authentication':
            console.log('User authenticated:', event.userName);
            break;
    }

    return event;
};

async function checkEmailUniqueness(userPoolId, email, triggerSource) {
    if (!email) return;

    const command = new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email}"`,
        Limit: 10
    });

    const response = await cognitoClient.send(command);
    
    if (response.Users && response.Users.length > 0) {
        throw new Error(`The email address ${email} has been registered. Please use another email address or log in directly.`);
    }
}

const verifyFatherInvitationCode = async (userPoolId, userName, userAttributes) => {
    const fatherInvitationCode = userAttributes['custom:fatherInvitationCode'];
    if (!fatherInvitationCode) {
        return;
    }

    const tableName = process.env.INVITATION_TABLE_NAME
    console.log("tableName: ", tableName)

    const res = await ddb.get({
        TableName: tableName,
        Key: { code: fatherInvitationCode }
    }).promise();

    if (!res.Item) {
        throw new Error('Father invitation code not found');
    }
};

/**
 * 生成并写入唯一邀请码
 */
async function confirmEmailCallback(userPoolId, userId, email) {
    const data = {
        // userPoolId: userPoolId,
        userId: userId,
        email: email,
    }
    const config = {
        timeout: 10000,
        headers: {
            [process.env.COGNITO_CONFIRM_HEADER_KEY]: process.env.COGNITO_CONFIRM_HEADER_VALUE
        }
    }
    const res = await axios.post(`${process.env.apiGatewayUrl}/public/user/confirmEmail`, data, config)
    console.log(`statusCode: ${res.status}, data: ${JSON.stringify(res.data)}`)
}

/**
 * 发送回调到外部 Node.js 程序
 */
async function sendCallback(data) {
    const callbackUrl = process.env.CALLBACK_URL;
    const authToken = process.env.CALLBACK_AUTH_TOKEN;

    if (!callbackUrl) {
        console.log('No CALLBACK_URL configured, skipping callback');
        return;
    }

    const parsedUrl = url.parse(callbackUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const postData = JSON.stringify(data);

    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'AWS-Lambda-Cognito-Trigger/1.0',
        },
    };

    // 添加认证 token（如果配置）
    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    return new Promise((resolve, reject) => {
        const req = protocol.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('Callback response:', responseBody);
                    resolve(responseBody);
                } else {
                    reject(new Error(`Callback failed with status ${res.statusCode}: ${responseBody}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}
