const { Duration, RemovalPolicy } = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const ecs = require('aws-cdk-lib/aws-ecs');
const ecs_patterns = require('aws-cdk-lib/aws-ecs-patterns');
const logs = require('aws-cdk-lib/aws-logs');
const ecr = require('aws-cdk-lib/aws-ecr');
const elbv2 = require('aws-cdk-lib/aws-elasticloadbalancingv2');
const iam = require('aws-cdk-lib/aws-iam');
const { Construct } = require('constructs');

class ECSConstruct extends Construct {
    constructor(scope, id) {
        super(scope, id);

        this.repository = ecr.Repository.fromRepositoryName(this, 'MyECRRepository', 'bitres');
        this.vpc = new ec2.Vpc(this, 'AppVpc', { maxAzs: 2 });
        this.cluster = new ecs.Cluster(this, 'AppCluster', {
            vpc: this.vpc,
            containerInsights: true,
        });

        // Main Service
        this.fargateService = new ecs_patterns.NetworkLoadBalancedFargateService(this, 'AppService', {
            cluster: this.cluster,
            cpu: 512,
            memoryLimitMiB: 1024,
            desiredCount: 1,
            publicLoadBalancer: false,
            healthCheckGracePeriod: Duration.seconds(60),
            taskImageOptions: {
                image: ecs.ContainerImage.fromRegistry(process.env.ECR_IMAGE_URI_MAIN),
                containerName: 'app',
                containerPort: 80,
                command: ['node', 'bin/www'],
                enableLogging: true,
                logDriver: ecs.LogDrivers.awsLogs({
                    streamPrefix: 'app',
                    logGroup: log(this, "AppLogGroup"),
                }),
                environment: {
                    PORT: '80',
                    NODE_ENV: 'production',
                    MONGODB_URI: process.env.MONGODB_URI || '',
                    REDIS_URI: process.env.REDIS_URI || '',
                    EMAIL_HOST: process.env.EMAIL_HOST || '',
                    EMAIL_PORT: process.env.EMAIL_PORT || '465',
                    EMAIL_FROM: process.env.EMAIL_FROM || '',
                    EMAIL_PASS: process.env.EMAIL_PASS || '',
                    COGNITO_CONFIRM_HEADER_KEY: process.env.COGNITO_CONFIRM_HEADER_KEY,
                    COGNITO_CONFIRM_HEADER_VALUE: process.env.COGNITO_CONFIRM_HEADER_VALUE,
                },
            },
        });

        healthCheck(this.fargateService)

        this.fargateService.service.connections.allowFromAnyIpv4(ec2.Port.tcp(80), 'Allow health check from NLB');

        executionRolePolicy(this.fargateService.taskDefinition)

        // Admin Service
        this.adminService = new ecs_patterns.NetworkLoadBalancedFargateService(this, 'AdminService', {
            cluster: this.cluster,
            cpu: 256,
            memoryLimitMiB: 512,
            desiredCount: 1,
            publicLoadBalancer: false,
            healthCheckGracePeriod: Duration.seconds(60),
            taskImageOptions: {
                image: ecs.ContainerImage.fromRegistry(process.env.ECR_IMAGE_URI_ADMIN),
                containerName: 'admin',
                containerPort: 80,
                enableLogging: true,
                logDriver: ecs.LogDrivers.awsLogs({
                    streamPrefix: 'admin',
                    logGroup: log(this, "AdminLogGroup"),
                }),
                environment: {
                    PORT: '80',
                    NODE_ENV: 'production',
                    MONGODB_URI: process.env.MONGODB_URI
                },
            },
        });

        healthCheck(this.adminService)

        this.adminService.service.connections.allowFromAnyIpv4(ec2.Port.tcp(80), 'Allow health check from NLB');

        executionRolePolicy(this.adminService.taskDefinition)

        // SyncTicker Service - Binance
        const syncTickerBinanceTaskDef = new ecs.FargateTaskDefinition(this, 'SyncTickerBinanceTaskDef', {
            cpu: 512,
            memoryLimitMiB: 1024,
        });
        syncTickerBinanceTaskDef.addContainer('syncTickerBinance', {
            image: ecs.ContainerImage.fromRegistry(process.env.ECR_IMAGE_URI_MAIN),
            command: ['node', 'marketsSync/tickers/syncTickerBinance'],
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'syncTickerBinance',
                logGroup: log(this, "SyncTickerBinanceLogGroup"),
            }),
            environment: {
                NODE_ENV: 'production',
                MONGODB_URI: process.env.MONGODB_URI || '',
                REDIS_URI: process.env.REDIS_URI || '',
            },
        });
        executionRolePolicy(syncTickerBinanceTaskDef);
        this.syncTickerBinanceService = new ecs.FargateService(this, 'SyncTickerBinanceService', {
            cluster: this.cluster,
            taskDefinition: syncTickerBinanceTaskDef,
            desiredCount: 1,
        });

        // SyncTicker Service - Okx - Contract
        const syncTickerOkxContractTaskDef = new ecs.FargateTaskDefinition(this, 'SyncTickerOkxContractTaskDef', {
            cpu: 1024,
            memoryLimitMiB: 2048,
        });
        syncTickerOkxContractTaskDef.addContainer('syncTickerOkxContract', {
            image: ecs.ContainerImage.fromRegistry(process.env.ECR_IMAGE_URI_MAIN),
            command: ['node', 'marketsSync/tickers/syncTickerOkxContract'],
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'syncTickerOkxContract',
                logGroup: log(this, "SyncTickerOkxContractLogGroup"),
            }),
            environment: {
                NODE_ENV: 'production',
                MONGODB_URI: process.env.MONGODB_URI || '',
                REDIS_URI: process.env.REDIS_URI || '',
            },
        });
        executionRolePolicy(syncTickerOkxContractTaskDef);
        this.syncTickerOkxContractService = new ecs.FargateService(this, 'SyncTickerOkxContractService', {
            cluster: this.cluster,
            taskDefinition: syncTickerOkxContractTaskDef,
            desiredCount: 1,
        });

        // SyncTicker Service - Okx - Spot
        const syncTickerOkxSpotTaskDef = new ecs.FargateTaskDefinition(this, 'SyncTickerOkxSpotTaskDef', {
            cpu: 1024,
            memoryLimitMiB: 2048,
        });
        syncTickerOkxSpotTaskDef.addContainer('syncTickerOkxSpot', {
            image: ecs.ContainerImage.fromRegistry(process.env.ECR_IMAGE_URI_MAIN),
            command: ['node', 'marketsSync/tickers/syncTickerOkxSpot'],
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'syncTickerOkxSpot',
                logGroup: log(this, "SyncTickerOkxSpotLogGroup"),
            }),
            environment: {
                NODE_ENV: 'production',
                MONGODB_URI: process.env.MONGODB_URI || '',
                REDIS_URI: process.env.REDIS_URI || '',
            },
        });
        executionRolePolicy(syncTickerOkxSpotTaskDef);
        this.syncTickerOkxSpotService = new ecs.FargateService(this, 'SyncTickerOkxSpotService', {
            cluster: this.cluster,
            taskDefinition: syncTickerOkxSpotTaskDef,
            desiredCount: 1,
        });
    }
}

const log = (scope, id) => {
    return new logs.LogGroup(scope, id, {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
    });
}

const executionRolePolicy = (taskDefinition) => {
    taskDefinition.addToExecutionRolePolicy(new iam.PolicyStatement({
        actions: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
        ],
        resources: ['*'],
    }));
}

const healthCheck = (service) => {
    service.targetGroup.configureHealthCheck({
        protocol: elbv2.Protocol.HTTP,
        path: '/healthz',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
    });
}

module.exports = { ECSConstruct };
