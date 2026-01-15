# app/models/resnet_cbam.py
import torch
import torch.nn as nn
import torch.nn.functional as F

import torchvision.models as models
from torchvision.models import ResNet101_Weights


# Các lớp mô hình CBAM và ResNetCBAM
class BasicConv(nn.Module):
    def __init__(self, in_planes, out_planes, kernel_size, stride=1, padding=0, dilation=1, groups=1, relu=True, bn=True, bias=False):
        super(BasicConv, self).__init__()
        self.out_channels = out_planes
        self.conv = nn.Conv2d(in_planes, out_planes, kernel_size=kernel_size, stride=stride, padding=padding, dilation=dilation, groups=groups, bias=bias)
        self.bn = nn.BatchNorm2d(out_planes,eps=1e-5, momentum=0.01, affine=True) if bn else None
        self.relu = nn.ReLU() if relu else None

    def forward(self, x):
        x = self.conv(x)
        if self.bn is not None:
            x = self.bn(x)
        if self.relu is not None:
            x = self.relu(x)
        return x

class Flatten(nn.Module):
    def forward(self, x):
        return x.view(x.size(0), -1)

class ChannelGate(nn.Module):
    def __init__(self, gate_channels, reduction_ratio=16, pool_types=['avg', 'max']):
        super(ChannelGate, self).__init__()
        self.gate_channels = gate_channels
        self.mlp = nn.Sequential(
            Flatten(),
            nn.Linear(gate_channels, gate_channels // reduction_ratio),
            nn.ReLU(),
            nn.Linear(gate_channels // reduction_ratio, gate_channels)
            )
        self.pool_types = pool_types
    def forward(self, x):
        channel_att_sum = None
        for pool_type in self.pool_types:
            if pool_type=='avg':
                avg_pool = F.avg_pool2d( x, (x.size(2), x.size(3)), stride=(x.size(2), x.size(3)))
                channel_att_raw = self.mlp( avg_pool )
            elif pool_type=='max':
                max_pool = F.max_pool2d( x, (x.size(2), x.size(3)), stride=(x.size(2), x.size(3)))
                channel_att_raw = self.mlp( max_pool )
            elif pool_type=='lp':
                lp_pool = F.lp_pool2d( x, 2, (x.size(2), x.size(3)), stride=(x.size(2), x.size(3)))
                channel_att_raw = self.mlp( lp_pool )
            elif pool_type=='lse':
                # LSE pool only
                lse_pool = logsumexp_2d(x)
                channel_att_raw = self.mlp( lse_pool )

            if channel_att_sum is None:
                channel_att_sum = channel_att_raw
            else:
                channel_att_sum = channel_att_sum + channel_att_raw

        scale = F.sigmoid( channel_att_sum ).unsqueeze(2).unsqueeze(3).expand_as(x)
        return x * scale

def logsumexp_2d(tensor):
    tensor_flatten = tensor.view(tensor.size(0), tensor.size(1), -1)
    s, _ = torch.max(tensor_flatten, dim=2, keepdim=True)
    outputs = s + (tensor_flatten - s).exp().sum(dim=2, keepdim=True).log()
    return outputs

class ChannelPool(nn.Module):
    def forward(self, x):
        return torch.cat( (torch.max(x,1)[0].unsqueeze(1), torch.mean(x,1).unsqueeze(1)), dim=1 )

class SpatialGate(nn.Module):
    def __init__(self):
        super(SpatialGate, self).__init__()
        kernel_size = 7
        self.compress = ChannelPool()
        self.spatial = BasicConv(2, 1, kernel_size, stride=1, padding=(kernel_size-1) // 2, relu=False)
    def forward(self, x):
        x_compress = self.compress(x)
        x_out = self.spatial(x_compress)
        scale = F.sigmoid(x_out) # broadcasting
        return x * scale

class CBAM(nn.Module):
    def __init__(self, gate_channels, reduction_ratio=16, pool_types=['avg', 'max'], no_spatial=False, no_channel=False):
        super(CBAM, self).__init__()
        self.no_channel = no_channel
        if not no_channel:
            self.ChannelGate = ChannelGate(gate_channels, reduction_ratio, pool_types)
        self.no_spatial = no_spatial
        if not no_spatial:
            self.SpatialGate = SpatialGate()
        self.dropout = nn.Dropout(0.5)

    def forward(self, x):
        x_out = x
        if not self.no_channel:
            x_out = self.ChannelGate(x_out)
        if not self.no_spatial:
            x_out = self.SpatialGate(x_out)
        return x_out


class ResNetCBAM(nn.Module):
    def __init__(self, num_classes=4, weights=ResNet101_Weights.IMAGENET1K_V1):
        super(ResNetCBAM, self).__init__()
        # Tải ResNet50 từ torchvision
        self.resnet = models.resnet101(weights=weights)

        # Thêm CBAM sau mỗi layer (layer1, layer2, layer3, layer4)
        self.cbam1 = CBAM(256)  # Sau layer1 (256 channels)
        self.cbam2 = CBAM(512)  # Sau layer2 (512 channels)
        self.cbam3 = CBAM(1024) # Sau layer3 (1024 channels)
        self.cbam4 = CBAM(2048) # Sau layer4 (2048 channels)

        self.dropout = nn.Dropout(0.5) 
        # Thay đổi lớp fully connected để phù hợp với số lớp của bạn
        self.resnet.fc = nn.Linear(self.resnet.fc.in_features, num_classes)

    def forward(self, x):
        x = self.resnet.conv1(x)
        x = self.resnet.bn1(x)
        x = self.resnet.relu(x)
        x = self.resnet.maxpool(x)

        x = self.resnet.layer1(x)
        # x = self.cbam1(x)  # Thêm CBAM sau layer1

        x = self.resnet.layer2(x)
        # x = self.cbam2(x)  # Thêm CBAM sau layer2
        # x = self.dropout(x)
        
        x = self.resnet.layer3(x)
        # x = self.cbam3(x)  # Thêm CBAM sau layer3
        # x = self.dropout(x)
        
        x = self.resnet.layer4(x)
        x = self.cbam4(x)  # Thêm CBAM sau layer4
        # x = self.dropout(x)
        
        x = self.resnet.avgpool(x)
        x = torch.flatten(x, 1)
        
        x = self.dropout(x)
        x = self.resnet.fc(x)
        return x
