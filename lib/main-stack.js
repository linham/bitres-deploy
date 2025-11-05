const { Stack, CfnOutput } = require('aws-cdk-lib');
const { LambdaConstruct } = require('./constructs/lambda-construct');
const { CognitoConstruct } = require('./constructs/cognito-construct');
const { ECSConstruct } = require('./constructs/ecs-construct');
const { ApiGatewayConstruct } = require('./constructs/api-gateway-construct');
const { ValkeyConstruct } = require('./constructs/valkey-construct');

class MainStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        const lambdaConstruct = new LambdaConstruct(this, 'Lambda');

        const ecsConstruct = new ECSConstruct(this, 'ECS');

        const cognitoConstruct = new CognitoConstruct(this, 'Cognito', {
            triggerLambda: lambdaConstruct.triggerLambda,
            googleClientId: process.env.GOOGLE_CLIENT_ID,
            googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackUrls: process.env.COGNITO_CALLBACK_URLS?.split(','),
            logoutUrls: process.env.COGNITO_LOGOUT_URLS?.split(','),
        });

        const valkeyConstruct = new ValkeyConstruct(this, 'Valkey', {
            vpc: ecsConstruct.vpc,
        });

        // Allow ECS tasks to access Valkey
        valkeyConstruct.securityGroup.addIngressRule(
            ecsConstruct.fargateService.service.connections.securityGroups[0],
            require('aws-cdk-lib/aws-ec2').Port.tcp(6379),
            'Allow ECS tasks to access Valkey'
        );

        const apiGatewayConstruct = new ApiGatewayConstruct(this, 'ApiGateway', {
            userPool: cognitoConstruct.userPool,
            fargateService: ecsConstruct.fargateService,
            adminService: ecsConstruct.adminService,
            adminAuthorizerLambda: lambdaConstruct.adminAuthorizer,
        });

        new CfnOutput(this, 'UserPoolId', {
            value: cognitoConstruct.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: 'CognitoUserPoolId',
        });

        new CfnOutput(this, 'UserPoolClientId', {
            value: cognitoConstruct.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: 'CognitoUserPoolClientId',
        });

        new CfnOutput(this, 'IdentityPoolId', {
            value: cognitoConstruct.identityPool.ref,
            description: 'Cognito Identity Pool ID',
            exportName: 'CognitoIdentityPoolId',
        });

        new CfnOutput(this, 'LambdaFunctionArn', {
            value: lambdaConstruct.triggerLambda.functionArn,
            description: 'Cognito Trigger Lambda Function ARN',
        });

        new CfnOutput(this, 'EcrRepositoryUri', {
            value: ecsConstruct.repository.repositoryUri
        });

        new CfnOutput(this, 'ApiBaseUrl', {
            value: apiGatewayConstruct.api.url,
            description: 'API Gateway Base URL',
            exportName: 'ApiGatewayBaseUrl',
        });

        new CfnOutput(this, 'PublicEndpoint', {
            value: `${apiGatewayConstruct.api.url}public/`,
            description: 'Public endpoint (no auth required)',
        });

        new CfnOutput(this, 'ProtectedEndpoint', {
            value: `${apiGatewayConstruct.api.url}protected/`,
            description: 'Protected endpoint (requires Cognito token)',
        });

        new CfnOutput(this, 'InternalAlbUrl', {
            value: `http://${ecsConstruct.fargateService.loadBalancer.loadBalancerDnsName}`
        });

        new CfnOutput(this, 'AdminEndpoint', {
            value: `${apiGatewayConstruct.api.url}admin/`,
            description: 'Admin endpoint (requires Cognito token)',
        });

        new CfnOutput(this, 'InternalAdminAlbUrl', {
            value: `http://${ecsConstruct.adminService.loadBalancer.loadBalancerDnsName}`
        });

        if (cognitoConstruct.hostedUiUrl) {
            new CfnOutput(this, 'HostedUIUrl', {
                value: cognitoConstruct.hostedUiUrl,
                description: 'Cognito Hosted UI URL',
            });
        }

        new CfnOutput(this, 'ValkeyEndpoint', {
            value: valkeyConstruct.endpoint,
            description: 'Valkey cluster endpoint',
            exportName: 'ValkeyEndpoint',
        });

        new CfnOutput(this, 'ValkeyPort', {
            value: valkeyConstruct.port,
            description: 'Valkey cluster port',
            exportName: 'ValkeyPort',
        });

        new CfnOutput(this, 'SyncTickerServiceName', {
            value: ecsConstruct.syncTickerService.serviceName,
            description: 'SyncTicker ECS service name',
        });
    }
}

module.exports = { MainStack };
