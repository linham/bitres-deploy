const { Duration } = require('aws-cdk-lib');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const { Construct } = require('constructs');

class ApiGatewayConstruct extends Construct {
    constructor(scope, id, props) {
        super(scope, id);

        const { userPool, fargateService, adminService } = props;

        this.api = new apigateway.RestApi(this, 'RestApi', {
            restApiName: 'bitres-api',
            description: 'Protected API behind Cognito authorizer',
            deployOptions: { stageName: 'prod' },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'Authorization',
                    'X-Amz-Date',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                ],
            },
        });

        this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
            cognitoUserPools: [userPool],
            identitySource: 'method.request.header.Authorization',
            authorizerName: 'CognitoAuthorizer',
        });

        this.adminAuthorizer = new apigateway.TokenAuthorizer(this, 'AdminAuthorizer', {
            handler: props.adminAuthorizerLambda,
            identitySource: 'method.request.header.Authorization',
            authorizerName: 'AdminAuthorizer',
            resultsCacheTtl: Duration.seconds(300),
        });

        const vpcLink = new apigateway.VpcLink(this, 'VpcLink', {
            targets: [fargateService.loadBalancer],
        });

        const publicProxy = this.api.root.addResource('public').addResource('{proxy+}');
        publicProxy.addMethod('ANY', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'ANY',
            uri: `http://${fargateService.loadBalancer.loadBalancerDnsName}/public/{proxy}`,
            options: {
                vpcLink,
                requestParameters: { 'integration.request.path.proxy': 'method.request.path.proxy' },
            },
        }), {
            requestParameters: { 'method.request.path.proxy': true },
        });

        const protectedProxy = this.api.root.addResource('protected').addResource('{proxy+}');
        protectedProxy.addMethod('ANY', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'ANY',
            uri: `http://${fargateService.loadBalancer.loadBalancerDnsName}/protected/{proxy}`,
            options: {
                vpcLink,
                requestParameters: {
                    'integration.request.path.proxy': 'method.request.path.proxy',
                    'integration.request.header.X-User-Id': 'context.authorizer.claims.sub',
                    'integration.request.header.X-User-Email': 'context.authorizer.claims.email',
                    'integration.request.header.X-User-Groups': 'context.authorizer.claims.cognito:groups',
                },
            },
        }), {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
            requestParameters: { 'method.request.path.proxy': true },
        });

        // Admin API routes
        const adminVpcLink = new apigateway.VpcLink(this, 'AdminVpcLink', {
            targets: [adminService.loadBalancer],
        });

        const adminProxy = this.api.root.addResource('admin').addResource('{proxy+}');
        adminProxy.addMethod('ANY', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'ANY',
            uri: `http://${adminService.loadBalancer.loadBalancerDnsName}/{proxy}`,
            options: {
                vpcLink: adminVpcLink,
                requestParameters: {
                    'integration.request.path.proxy': 'method.request.path.proxy',
                    'integration.request.header.X-User-Id': 'context.authorizer.userId',
                    'integration.request.header.X-User-Email': 'context.authorizer.email',
                    'integration.request.header.X-User-Groups': 'context.authorizer.groups',
                },
            },
        }), {
            authorizer: this.adminAuthorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: { 'method.request.path.proxy': true },
        });
    }
}

module.exports = { ApiGatewayConstruct };
