/**
 * 服务状态信息接口
 * 基于 MicroserviceOptions，并添加运行时信息
 */
export interface ServiceStatusInfo {
  name: string;
  version: string;
  prefix?: string;
  hostname?: string;
  port?: number;
  env?: string;
  status?: string;
}

interface InfoCardProps {
  icon: string;
  iconColor: string;
  bgColor: string;
  label: string;
  value: string | number | any;
}

const InfoCard = ({
  icon,
  iconColor,
  bgColor,
  label,
  value,
}: InfoCardProps) => (
  <div className={`${bgColor} p-4 rounded-lg`}>
    <div className="flex items-center mb-2">
      <svg
        className={`w-5 h-5 ${iconColor} mr-2`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={icon}
        />
      </svg>
      <span className="text-sm font-medium text-gray-600">{label}</span>
    </div>
    <p className={`text-xl font-semibold text-gray-900`}>{value}</p>
  </div>
);

const getEnvironmentBadgeClass = (env: string): string => {
  const normalizedEnv = env.toLowerCase();
  switch (normalizedEnv) {
    case "production":
    case "prod":
      return "bg-red-100 text-red-800";
    case "staging":
    case "stg":
      return "bg-yellow-100 text-yellow-800";
    case "development":
    case "dev":
    default:
      return "bg-blue-100 text-blue-800";
  }
};

const getStatusBadgeClass = (status: string): string => {
  switch (status.toLowerCase()) {
    case "running":
      return "bg-green-100 text-green-800";
    case "stopped":
      return "bg-gray-100 text-gray-800";
    case "error":
      return "bg-red-100 text-red-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
};

export const ServiceInfoCards = ({
  serviceInfo,
}: {
  serviceInfo: ServiceStatusInfo;
}) => {
  // 从环境变量获取运行环境，如果没有则使用传入的值或默认值
  const env =
    serviceInfo.env ||
    (typeof process !== "undefined" && process.env?.NODE_ENV) ||
    "dev";

  const status = serviceInfo.status || "running";

  const infoCards = [
    {
      icon: "M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2",
      iconColor: "text-blue-600",
      bgColor: "bg-blue-50",
      label: "服务名称",
      value: serviceInfo.name,
    },
    {
      icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
      iconColor: "text-orange-600",
      bgColor: "bg-orange-50",
      label: "服务路径",
      value: serviceInfo.prefix || "/",
    },
    {
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
      label: "运行环境",
      value: (
        <span
          className={`px-2 py-1 rounded-full text-sm ${getEnvironmentBadgeClass(env)}`}
        >
          {env}
        </span>
      ),
    },
    {
      icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
      iconColor: "text-purple-600",
      bgColor: "bg-purple-50",
      label: "版本号",
      value: serviceInfo.version || "unknown",
    },
    ...(serviceInfo.port
      ? [
          {
            icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01",
            iconColor: "text-indigo-600",
            bgColor: "bg-indigo-50",
            label: "端口",
            value: serviceInfo.port,
          },
        ]
      : []),
    {
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      iconColor: "text-emerald-600",
      bgColor: "bg-emerald-50",
      label: "运行状态",
      value: (
        <span
          className={`px-2 py-1 rounded-full text-sm ${getStatusBadgeClass(status)}`}
        >
          {status}
        </span>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
        <svg
          className="w-6 h-6 mr-2 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        服务基本信息
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {infoCards.map((card, index) => (
          <InfoCard key={index} {...card} />
        ))}
      </div>
    </div>
  );
};

export const ServiceStatusPage = ({
  serviceInfo,
}: {
  serviceInfo: ServiceStatusInfo;
}) => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Service Status
          </h1>
          <p className="text-gray-600">查看服务运行状态和基本信息</p>
        </div>
        <ServiceInfoCards serviceInfo={serviceInfo} />
      </div>
    </div>
  );
};

export default ServiceStatusPage;
