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

        // Subnet Group
        const subnetGroup = new elasticache.CfnSubnetGroup(this, 'ValkeySubnetGroup', {
            description: 'Subnet group for Valkey',
            subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
            cacheSubnetGroupName: 'valkey-subnet-group',
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
    }
}

module.exports = { ValkeyConstruct };
