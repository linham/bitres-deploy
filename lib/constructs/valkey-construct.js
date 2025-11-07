const { Construct } = require('constructs');
const ec2 = require('aws-cdk-lib/aws-ec2');
const elasticache = require('aws-cdk-lib/aws-elasticache');
const { RemovalPolicy } = require('aws-cdk-lib');

class ValkeyConstruct extends Construct {
    constructor(scope, id, props) {
        super(scope, id);

        const { vpc } = props;

        // Security Group for Valkey
        this.securityGroup = new ec2.SecurityGroup(this, 'ValkeySecurityGroup', {
            vpc,
            description: 'Security group for Valkey cluster',
            allowAllOutbound: true,
        });

        this.securityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(6379),
            'Allow Valkey access from VPC'
        );

        // Allow external access from specific IP
        if (props.allowedIp) {
            this.securityGroup.addIngressRule(
                ec2.Peer.ipv4(props.allowedIp),
                ec2.Port.tcp(6379),
                'Allow Valkey access from specific IP'
            );
        }

        // Subnet Group - always use private subnets
        const subnets = vpc.privateSubnets;
        const subnetGroupName = 'valkey-subnet-group';
        const subnetGroup = new elasticache.CfnSubnetGroup(this, 'ValkeySubnetGroup', {
            description: 'Subnet group for Valkey',
            subnetIds: subnets.map(subnet => subnet.subnetId),
            cacheSubnetGroupName: subnetGroupName,
        });

        // Valkey Replication Group
        this.replicationGroup = new elasticache.CfnReplicationGroup(this, 'ValkeyReplicationGroup', {
            replicationGroupDescription: 'Valkey cluster',
            engine: 'valkey',
            cacheNodeType: 'cache.t3.micro',
            numCacheClusters: 1,
            automaticFailoverEnabled: false,
            cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
            securityGroupIds: [this.securityGroup.securityGroupId],
            engineVersion: '7.2',
            transitEncryptionEnabled: false,
        });

        this.replicationGroup.addDependency(subnetGroup);
        this.replicationGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);

        this.endpoint = this.replicationGroup.attrPrimaryEndPointAddress;
        this.port = this.replicationGroup.attrPrimaryEndPointPort;

        // EC2 proxy for external access
        if (props.allowedIp) {
            const proxySecurityGroup = new ec2.SecurityGroup(this, 'ValkeyProxySecurityGroup', {
                vpc,
                description: 'Security group for Valkey proxy',
                allowAllOutbound: true,
            });

            proxySecurityGroup.addIngressRule(
                ec2.Peer.ipv4(props.allowedIp),
                ec2.Port.tcp(6379),
                'Allow Redis access from specific IP'
            );

            this.securityGroup.addIngressRule(
                proxySecurityGroup,
                ec2.Port.tcp(6379),
                'Allow Valkey access from proxy'
            );

            const userData = ec2.UserData.forLinux();
            userData.addCommands(
                'yum update -y',
                'yum install -y socat',
                `nohup socat TCP4-LISTEN:6379,fork TCP4:${this.endpoint}:6379 &`
            );

            this.proxyInstance = new ec2.Instance(this, 'ValkeyProxy', {
                vpc,
                instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
                machineImage: ec2.MachineImage.latestAmazonLinux2023(),
                securityGroup: proxySecurityGroup,
                vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
                userData,
            });

            this.publicEndpoint = this.proxyInstance.instancePublicIp;
        }
    }
}

module.exports = { ValkeyConstruct };
