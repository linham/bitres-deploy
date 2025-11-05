const { Stack, CfnOutput, RemovalPolicy, Duration } = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');
const s3deploy = require('aws-cdk-lib/aws-s3-deployment');
const path = require('path');

class ApiDocStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        const bucket = new s3.Bucket(this, 'StaticSitesBucket', {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        const authString = Buffer.from(`${process.env.API_DOC_AUTH_ACCOUNT}:${process.env.API_DOC_AUTH_PWD}`).toString('base64');

        const authFunction = new cloudfront.Function(this, 'AuthFunction', {
            code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var authString = 'Basic ${authString}';
    
    if (!headers.authorization || headers.authorization.value !== authString) {
        return {
            statusCode: 401,
            statusDescription: 'Unauthorized',
            headers: {
                'www-authenticate': { value: 'Basic realm="Protected Site"' }
            }
        };
    }
    return request;
}
            `),
        });

        const distribution = new cloudfront.Distribution(this, 'StaticSitesDistribution', {
            defaultBehavior: {
                origin: new origins.S3Origin(bucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                functionAssociations: [{
                    function: authFunction,
                    eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                }],
            },
            additionalBehaviors: {
                '/web/*': {
                    origin: new origins.S3Origin(bucket),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    functionAssociations: [{
                        function: authFunction,
                        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                    }],
                },
                '/admin/*': {
                    origin: new origins.S3Origin(bucket),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    functionAssociations: [{
                        function: authFunction,
                        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                    }],
                },
            },
        });

        new s3deploy.BucketDeployment(this, 'DeployWebSite', {
            sources: [s3deploy.Source.asset(path.join(__dirname, '../../bitres-server/docs'))],
            destinationBucket: bucket,
            destinationKeyPrefix: 'web',
            distribution,
            distributionPaths: ['/web/*'],
        });

        new s3deploy.BucketDeployment(this, 'DeployAdminSite', {
            sources: [s3deploy.Source.asset(path.join(__dirname, '../../bitres-admin/docs'))],
            destinationBucket: bucket,
            destinationKeyPrefix: 'admin',
            distribution,
            distributionPaths: ['/admin/*'],
        });

        new CfnOutput(this, 'WebSiteUrl', {
            value: `https://${distribution.distributionDomainName}/web`,
            description: '官网文档站点',
        });

        new CfnOutput(this, 'AdminSiteUrl', {
            value: `https://${distribution.distributionDomainName}/admin`,
            description: '管理后台站点',
        });

        new CfnOutput(this, 'BucketName', {
            value: bucket.bucketName,
            description: 'S3 存储桶名称',
        });
    }
}

module.exports = { ApiDocStack };
