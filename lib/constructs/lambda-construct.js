const { Duration } = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const iam = require('aws-cdk-lib/aws-iam');
const { Construct } = require('constructs');
const path = require('path');

class LambdaConstruct extends Construct {
    constructor(scope, id) {
        super(scope, id);

        const triggerRole = new iam.Role(this, 'CognitoTriggerRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        triggerRole.addToPolicy(new iam.PolicyStatement({
            actions: ['cognito-idp:AdminUpdateUserAttributes', 'cognito-idp:ListUsers'],
            resources: ['*'],
        }));

        this.triggerLambda = new lambda.Function(this, 'CognitoTriggerFunction', {
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/cognito-trigger')),
            timeout: Duration.seconds(30),
            role: triggerRole,
            environment: {
                CALLBACK_URL: process.env.CALLBACK_URL,
                CALLBACK_AUTH_TOKEN: process.env.CALLBACK_AUTH_TOKEN,
                apiGatewayUrl: process.env.APIGATEWAY_URL,
                COGNITO_CONFIRM_HEADER_KEY: process.env.COGNITO_CONFIRM_HEADER_KEY,
                COGNITO_CONFIRM_HEADER_VALUE: process.env.COGNITO_CONFIRM_HEADER_VALUE,
            },
        });

        this.triggerRole = triggerRole;

        this.adminAuthorizer = new lambda.Function(this, 'AdminAuthorizerFunction', {
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/admin-authorizer')),
            timeout: Duration.seconds(10),
        });
    }
}

module.exports = { LambdaConstruct };
